// sliding window algorithm - implemented in phase 2
import type Redis from 'ioredis';
import type { AlgorithmResult } from './index';

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
