// fixed window algorithm - implemented in phase 2
import type Redis from 'ioredis';
import type { AlgorithmResult } from './index';

/**
 * fixed window counter — increments a redis key on each request and sets a
 * TTL on the first increment so the counter resets after `windowMs` ms.
 *
 * uses a single INCR + conditional PEXPIRE (no lua required). not atomic for
 * the incr/expire pair, but collisions only risk a missing expiry on the very
 * first request in a window, which resolves itself on the next request.
 *
 * @param redis  - ioredis client
 * @param key    - redis key to use as the counter (e.g. `rl:usr_abc`)
 * @param limit  - maximum requests allowed per window
 * @param windowMs - window duration in milliseconds
 * @returns `{ allowed: 1, remaining }` if the request is within the limit,
 *          `{ allowed: 0, remaining: 0 }` otherwise
 *
 * @example
 * const result = await fixedWindow(redis, 'rl:usr_abc', 100, 60_000);
 * if (!result.allowed) throw new Error('rate limit exceeded');
 */
export async function fixedWindow(
  redis: Redis,
  key: string,
  limit: number,
  windowMs: number,
): Promise<AlgorithmResult> {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, windowMs);
  }
  if (count <= limit) {
    return { allowed: 1, remaining: limit - count };
  }
  return { allowed: 0, remaining: 0 };
}
