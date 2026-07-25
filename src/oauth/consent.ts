import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import type { PinewrapsOAuthProvider } from './provider.js';

function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderForm(pendingId: string, clientName: string | undefined, error?: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Connect to Pinewraps SEO</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #111; color: #eee; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { background: #1b1b1b; border: 1px solid #333; border-radius: 12px; padding: 32px; width: 320px; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  p { font-size: 14px; color: #aaa; margin: 0 0 20px; }
  input { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px; border: 1px solid #444; background: #0d0d0d; color: #eee; font-size: 14px; margin-bottom: 12px; }
  button { width: 100%; padding: 10px 12px; border-radius: 8px; border: none; background: #e8734a; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
  .error { color: #ff8080; font-size: 13px; margin-bottom: 12px; }
</style>
</head>
<body>
  <div class="card">
    <h1>Connect ${clientName ? escapeHtml(clientName) : 'this app'} to Pinewraps SEO</h1>
    <p>Enter the server access token to approve this connection.</p>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
    <form method="POST" action="/authorize/consent">
      <input type="hidden" name="pending" value="${escapeHtml(pendingId)}">
      <input type="password" name="token" placeholder="Access token" autofocus required>
      <button type="submit">Approve</button>
    </form>
  </div>
</body>
</html>`;
}

export function consentRouter(provider: PinewrapsOAuthProvider): Router {
  const router = Router();

  router.get('/authorize/consent', (req, res) => {
    const pendingId = String(req.query.pending || '');
    const entry = provider.getPending(pendingId);
    if (!entry) {
      res.status(400).send(renderForm('', undefined, 'This authorization request has expired. Close this tab and try adding the connector again.'));
      return;
    }
    res.set('Content-Type', 'text/html').send(renderForm(pendingId, entry.client.client_name));
  });

  router.post('/authorize/consent', (req, res) => {
    const pendingId = String(req.body?.pending || '');
    const token = String(req.body?.token || '');
    const expected = process.env.MCP_SERVER_ACCESS_TOKEN;

    const entry = provider.getPending(pendingId);
    if (!entry) {
      res.status(400).send(renderForm('', undefined, 'This authorization request has expired. Close this tab and try adding the connector again.'));
      return;
    }

    if (!expected || !token || !safeEquals(token, expected)) {
      res.status(401).send(renderForm(pendingId, entry.client.client_name, 'Incorrect access token.'));
      return;
    }

    try {
      const redirectUrl = provider.approvePending(pendingId);
      res.redirect(redirectUrl);
    } catch (err) {
      res.status(400).send(renderForm('', undefined, err instanceof Error ? err.message : 'Something went wrong.'));
    }
  });

  return router;
}
