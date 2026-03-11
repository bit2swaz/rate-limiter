import { Request, Response, NextFunction } from 'express';
import { redis } from '../services/redisClient';
import { getRule } from '../services/ruleService';
import { getAlgorithmFn } from '../algorithms';

/**
 * Per-key rate limiting middleware.
 *
 * Reads `x-api-key` from request headers, looks up the corresponding rule,
 * dispatches to the appropriate algorithm, and either calls `next()` (allowed)
 * or returns `429` (rejected). Sets standard rate-limit response headers on
 * every response:
 *  - `X-RateLimit-Limit`     — configured limit / capacity
 *  - `X-RateLimit-Remaining` — remaining requests in the current window/bucket
 *  - `Retry-After`           — seconds until next allowed request (429 only)
 */
export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (!apiKey) {
    res.status(401).json({ error: 'missing x-api-key header' });
    return;
  }

  const rule = await getRule(apiKey);
  if (!rule) {
    res.status(401).json({ error: 'unknown api key' });
    return;
  }

  const key = `rl:${apiKey}`;
  const now = Date.now();
  const fn = getAlgorithmFn(rule.algorithm);
  const result = await fn(redis, key, rule, now);

  // X-RateLimit-Limit: the configured ceiling for this key
  const limit = rule.limit ?? rule.capacity ?? 0;
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));

  if (!result.allowed) {
    // Retry-After: seconds until the window resets or a token is earned
    const retryAfterMs =
      rule.windowMs ?? Math.ceil(1000 / Math.max(rule.refillRate ?? 1, 0.001));
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
    res.status(429).json({ error: 'rate limit exceeded' });
    return;
  }

  next();
}
