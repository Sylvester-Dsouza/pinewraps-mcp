import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';

export interface RefreshTokenRecord {
  clientId: string;
  scopes: string[];
}

interface PersistedState {
  clients: Record<string, OAuthClientInformationFull>;
  refreshTokens: Record<string, RefreshTokenRecord>;
}

const STORE_PATH = process.env.OAUTH_STORE_PATH || './data/oauth-store.json';

function load(): PersistedState {
  try {
    if (existsSync(STORE_PATH)) {
      return JSON.parse(readFileSync(STORE_PATH, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to read OAuth store, starting fresh:', err);
  }
  return { clients: {}, refreshTokens: {} };
}

// Persists dynamically-registered OAuth clients and refresh tokens to disk so a process
// restart doesn't force reconnecting the Cowork connector. Access tokens and in-flight
// authorization codes stay in memory only — short-lived by design, and losing them on
// restart just means a normal refresh-token round trip, which is correct OAuth behavior.
//
// Note: on most hosts (Railway included) this survives process restarts within the same
// container but not a full redeploy, unless a persistent volume is mounted at this path's
// directory. That's an acceptable tradeoff for a single-tenant server.
export class OAuthStore {
  private state: PersistedState = load();

  private persist(): void {
    try {
      mkdirSync(dirname(STORE_PATH), { recursive: true });
      writeFileSync(STORE_PATH, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.error('Failed to persist OAuth store:', err);
    }
  }

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return this.state.clients[clientId];
  }

  saveClient(client: OAuthClientInformationFull): void {
    this.state.clients[client.client_id] = client;
    this.persist();
  }

  getRefreshToken(token: string): RefreshTokenRecord | undefined {
    return this.state.refreshTokens[token];
  }

  saveRefreshToken(token: string, record: RefreshTokenRecord): void {
    this.state.refreshTokens[token] = record;
    this.persist();
  }

  deleteRefreshToken(token: string): void {
    delete this.state.refreshTokens[token];
    this.persist();
  }
}
