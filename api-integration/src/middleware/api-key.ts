import { timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/api-error';

function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Machine auth for the MCP server (and any other trusted automation) — checks a static
 * key instead of a Firebase user session. Scoped only to routes mounted behind it
 * (see routes/mcp.routes.ts); never grants the full admin surface.
 */
export const requireApiKey = (req: Request, res: Response, next: NextFunction) => {
  const expected = process.env.MCP_API_KEY;
  if (!expected) {
    return next(new ApiError({ message: 'MCP_API_KEY is not configured', statusCode: 500 }));
  }

  const provided = req.headers['x-api-key'];
  if (typeof provided !== 'string' || !safeEquals(provided, expected)) {
    return next(new ApiError({ message: 'Invalid or missing API key', statusCode: 401 }));
  }

  next();
};
