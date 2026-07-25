import 'dotenv/config';
import express from 'express';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { createApiClient } from './apiClient.js';
import { buildMcpServer } from './server.js';
import { OAuthStore } from './oauth/store.js';
import { PinewrapsOAuthProvider } from './oauth/provider.js';
import { consentRouter } from './oauth/consent.js';

const PORT = Number(process.env.PORT) || 3900;

// Defense in depth: never let one bad request take the whole process down. Without these,
// an unhandled rejection (e.g. from transport/server cleanup racing a proxy-closed connection)
// crashes the entire Node process under modern Node's default --unhandled-rejections=strict.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

const publicUrlRaw = process.env.PUBLIC_URL;
if (!publicUrlRaw) {
  throw new Error('PUBLIC_URL is not set — needed as the OAuth issuer URL (e.g. https://your-app.up.railway.app)');
}
const publicUrl = new URL(publicUrlRaw);
const mcpResourceUrl = new URL('/mcp', publicUrl);

const oauthStore = new OAuthStore();
const oauthProvider = new PinewrapsOAuthProvider(oauthStore);

// Bound to 0.0.0.0 for hosting (e.g. Render/Railway); the SDK's automatic DNS-rebinding
// protection only applies to localhost hosts, and access here is gated by OAuth instead.
const app = createMcpExpressApp({ host: '0.0.0.0' });
app.use(express.urlencoded({ extended: true }));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

// Installs /.well-known/oauth-authorization-server, /.well-known/oauth-protected-resource,
// /register (dynamic client registration), /authorize, /token, /revoke.
app.use(
  mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl: publicUrl,
    resourceServerUrl: mcpResourceUrl,
    scopesSupported: ['mcp:tools']
  })
);

// Our own consent step: /authorize (above) redirects here, gated by MCP_SERVER_ACCESS_TOKEN.
app.use(consentRouter(oauthProvider));

const requireMcpAuth = requireBearerAuth({
  verifier: oauthProvider,
  requiredScopes: ['mcp:tools'],
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpResourceUrl)
});

app.post('/mcp', requireMcpAuth, async (req, res) => {
  try {
    const api = createApiClient();
    const server = buildMcpServer(api);
    // Stateless mode: a fresh server + transport per request, no session to manage across replicas.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    res.on('close', () => {
      transport.close().catch((err) => console.error('Error closing transport:', err));
      server.close().catch((err) => console.error('Error closing server:', err));
    });
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null
      });
    }
  }
});

app.get('/mcp', requireMcpAuth, (_req, res) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null
    })
  );
});

app.delete('/mcp', requireMcpAuth, (_req, res) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null
    })
  );
});

app.listen(PORT, () => {
  console.log(`Pinewraps SEO MCP server listening on port ${PORT}`);
});
