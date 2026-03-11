// fixed window algorithm - implemented in phase 2
import type Redis from 'ioredis';
import type { AlgorithmResult } from './index';

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
