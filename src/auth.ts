import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

// Gate for inbound requests from Claude: requires "Authorization: Bearer <MCP_SERVER_ACCESS_TOKEN>".
export function requireBearerToken(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.MCP_SERVER_ACCESS_TOKEN;
  if (!expected) {
    res.status(500).json({ error: 'MCP_SERVER_ACCESS_TOKEN is not configured on this server' });
    return;
  }

  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

  if (!token || !safeEquals(token, expected)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
