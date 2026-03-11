import { Request, Response, NextFunction } from 'express';

/**
 * Global Express error handler — must be the last middleware registered.
 *
 * - logs the full error (with stack) when `NODE_ENV !== 'production'`
 * - always responds with a generic `500 { error: 'internal server error' }`
 *   so stack traces and internal details are never leaked to clients
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (process.env.NODE_ENV !== 'production') {
    console.error('unhandled error:', err);
  } else {
    const message = err instanceof Error ? err.message : String(err);
    console.error('unhandled error:', message);
  }
  res.status(500).json({ error: 'internal server error' });
}
