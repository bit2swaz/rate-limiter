// sliding window algorithm - implemented in phase 2
import type Redis from 'ioredis';
import type { AlgorithmResult } from './index';

/**
 * sliding window log — delegates to the `scripts/lua/sliding_window.lua` lua
 * script running atomically inside redis.
 *
 * maintains a sorted set of request timestamps. on each request, entries older
 * than `now - windowMs` are pruned, then the remaining count is checked against
 * `limit`. a `math.random()` suffix on each ZADD score prevents member
 * collisions under high concurrency.
 *
 * @param redis    - ioredis client (must have `evalSlidingWindow` loaded)
 * @param key      - redis key for the sorted set (e.g. `rl:usr_abc`)
 * @param windowMs - sliding window duration in milliseconds
 * @param limit    - maximum requests in the window
 * @param now      - current unix timestamp in ms (Date.now())
 * @returns `{ allowed: 1, remaining }` if the request fits in the window,
 *          `{ allowed: 0, remaining: 0 }` if the limit is reached
 *
 * @example
 * const result = await slidingWindow(redis, 'rl:usr_abc', 60_000, 100, Date.now());
 * if (!result.allowed) throw new Error('rate limit exceeded');
 */
export async function slidingWindow(
  redis: Redis,
  key: string,
  windowMs: number,
  limit: number,
  now: number,
): Promise<AlgorithmResult> {
  const [allowed, remaining] = await (redis as import('ioredis').Redis).evalSlidingWindow(
    key,
    windowMs,
    limit,
    now,
  );
  return { allowed: allowed as 0 | 1, remaining };
}
