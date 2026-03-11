// sliding window algorithm - implemented in phase 2
import type Redis from 'ioredis';

export async function slidingWindow(
  redis: Redis,
  key: string,
  windowMs: number,
  limit: number,
  now: number,
): Promise<0 | 1> {
  const result = await (redis as import('ioredis').Redis).evalSlidingWindow(
    key,
    windowMs,
    limit,
    now,
  );
  return result as 0 | 1;
}
