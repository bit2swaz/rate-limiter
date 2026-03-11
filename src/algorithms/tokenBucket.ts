// token bucket algorithm - implemented in phase 2
import type Redis from 'ioredis';
import type { AlgorithmResult } from './index';

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
