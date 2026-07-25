import 'dotenv/config';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { requireBearerToken } from './auth.js';
import { createApiClient } from './apiClient.js';
import { buildMcpServer } from './server.js';

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

// Bound to 0.0.0.0 for hosting (e.g. Render); the SDK's automatic DNS-rebinding protection only
// applies to localhost hosts, so this relies on requireBearerToken for access control instead.
const app = createMcpExpressApp({ host: '0.0.0.0' });

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.post('/mcp', requireBearerToken, async (req, res) => {
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

app.get('/mcp', requireBearerToken, (_req, res) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null
    })
  );
});

app.delete('/mcp', requireBearerToken, (_req, res) => {
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
