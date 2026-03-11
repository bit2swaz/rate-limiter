import { Request, Response, NextFunction } from 'express';
import { redis } from '../services/redisClient';
import { fixedWindow } from '../algorithms/fixedWindow';

const AUTH_LIMIT = 10;
const AUTH_WINDOW_MS = 60_000; // 1 minute

/**
 * Brute-force protection for `POST /auth/token`.
 *
 * Applies a fixed-window counter keyed by IP address.
 * Allows at most {@link AUTH_LIMIT} requests per IP per minute.
 * Returns 429 with `Retry-After` on violation.
 */
export async function authRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim() ??
    req.socket.remoteAddress ??
    'unknown';

  const key = `rl:auth:${ip}`;
  const result = await fixedWindow(redis, key, AUTH_LIMIT, AUTH_WINDOW_MS);

  if (!result.allowed) {
    res.setHeader('Retry-After', String(Math.ceil(AUTH_WINDOW_MS / 1000)));
    res.status(429).json({ error: 'too many requests' });
    return;
  }

  next();
}
