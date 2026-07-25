import { randomBytes, randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type { AuthorizationParams, OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { InvalidGrantError, InvalidRequestError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthStore } from './store.js';

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_SCOPES = ['mcp:tools'];

interface PendingAuthorization {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
}

interface AuthCodeRecord {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
}

interface AccessTokenRecord {
  clientId: string;
  scopes: string[];
  expiresAt: number;
}

class PinewrapsClientsStore implements OAuthRegisteredClientsStore {
  constructor(private store: OAuthStore) {}

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return this.store.getClient(clientId);
  }

  // The SDK's registration handler already generates client_id (and client_secret for
  // confidential clients) before calling this — we just persist and hand it back.
  registerClient(client: OAuthClientInformationFull): OAuthClientInformationFull {
    this.store.saveClient(client);
    return client;
  }
}

// Single-tenant OAuth 2.1 authorization server (with PKCE, handled by the SDK's token
// handler) for this MCP server. Dynamic client registration is open (any client can
// register itself, per the DCR spec) — the actual gate is the /authorize step, which
// requires MCP_SERVER_ACCESS_TOKEN as a one-time password before a code is ever issued.
export class PinewrapsOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore;
  private pending = new Map<string, PendingAuthorization>();
  private codes = new Map<string, AuthCodeRecord>();
  private accessTokens = new Map<string, AccessTokenRecord>();

  constructor(private store: OAuthStore) {
    this.clientsStore = new PinewrapsClientsStore(store);
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    if (!client.redirect_uris.includes(params.redirectUri)) {
      throw new InvalidRequestError('Unregistered redirect_uri');
    }
    const pendingId = randomUUID();
    this.pending.set(pendingId, { client, params });
    res.redirect(`/authorize/consent?pending=${pendingId}`);
  }

  // Called by the consent route (src/oauth/consent.ts) once MCP_SERVER_ACCESS_TOKEN is verified.
  getPending(pendingId: string): PendingAuthorization | undefined {
    return this.pending.get(pendingId);
  }

  approvePending(pendingId: string): string {
    const entry = this.pending.get(pendingId);
    if (!entry) {
      throw new InvalidRequestError('Authorization request expired or not found — please retry adding the connector');
    }
    this.pending.delete(pendingId);

    const code = randomBytes(32).toString('hex');
    this.codes.set(code, entry);

    const redirectUrl = new URL(entry.params.redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (entry.params.state !== undefined) {
      redirectUrl.searchParams.set('state', entry.params.state);
    }
    return redirectUrl.toString();
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const entry = this.codes.get(authorizationCode);
    if (!entry || entry.client.client_id !== client.client_id) {
      throw new InvalidGrantError('Invalid authorization code');
    }
    return entry.params.codeChallenge;
  }

  async exchangeAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<OAuthTokens> {
    const entry = this.codes.get(authorizationCode);
    if (!entry || entry.client.client_id !== client.client_id) {
      throw new InvalidGrantError('Invalid authorization code');
    }
    this.codes.delete(authorizationCode);

    const scopes = entry.params.scopes?.length ? entry.params.scopes : DEFAULT_SCOPES;
    return this.issueTokens(client.client_id, scopes);
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, scopes?: string[]): Promise<OAuthTokens> {
    const record = this.store.getRefreshToken(refreshToken);
    if (!record || record.clientId !== client.client_id) {
      throw new InvalidGrantError('Invalid refresh token');
    }
    // Rotate the refresh token on use.
    this.store.deleteRefreshToken(refreshToken);
    return this.issueTokens(client.client_id, scopes?.length ? scopes : record.scopes);
  }

  private issueTokens(clientId: string, scopes: string[]): OAuthTokens {
    const accessToken = randomBytes(32).toString('hex');
    const refreshToken = randomBytes(32).toString('hex');

    this.accessTokens.set(accessToken, {
      clientId,
      scopes,
      expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS
    });
    this.store.saveRefreshToken(refreshToken, { clientId, scopes });

    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: ACCESS_TOKEN_TTL_MS / 1000,
      refresh_token: refreshToken,
      scope: scopes.join(' ')
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const record = this.accessTokens.get(token);
    if (!record || record.expiresAt < Date.now()) {
      throw new InvalidTokenError('Invalid or expired access token');
    }
    return {
      token,
      clientId: record.clientId,
      scopes: record.scopes,
      expiresAt: Math.floor(record.expiresAt / 1000)
    };
  }

  async revokeToken(_client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    this.accessTokens.delete(request.token);
    this.store.deleteRefreshToken(request.token);
  }
}
