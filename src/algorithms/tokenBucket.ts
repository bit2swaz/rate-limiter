// token bucket algorithm - implemented in phase 2
import type Redis from 'ioredis';
import type { AlgorithmResult } from './index';

/**
 * token bucket — delegates to the `scripts/lua/token_bucket.lua` lua script
 * running atomically inside redis.
 *
 * the bucket starts full (`capacity` tokens). each request consumes one token.
 * tokens refill continuously at `refillRate` per second, capped at `capacity`.
 * a request is rejected immediately if the bucket is empty.
 *
 * @param redis      - ioredis client (must have `evalTokenBucket` loaded)
 * @param key        - redis key for this bucket (e.g. `rl:usr_abc`)
 * @param capacity   - maximum tokens in the bucket
 * @param refillRate - tokens added per second
 * @param now        - current unix timestamp in ms (Date.now())
 * @returns `{ allowed: 1, remaining }` if a token was consumed,
 *          `{ allowed: 0, remaining: 0 }` if the bucket is empty
 *
 * @example
 * const result = await tokenBucket(redis, 'rl:usr_abc', 50, 10, Date.now());
 * if (!result.allowed) throw new Error('rate limit exceeded');
 */
export async function tokenBucket(
  redis: Redis,
  key: string,
  capacity: number,
  refillRate: number,
  now: number,
): Promise<AlgorithmResult> {
  const [allowed, remaining] = await (redis as import('ioredis').Redis).evalTokenBucket(
    key,
    capacity,
    refillRate,
    now,
  );
  return { allowed: allowed as 0 | 1, remaining };
}
