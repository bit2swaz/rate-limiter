// token bucket algorithm - implemented in phase 2
import type Redis from 'ioredis';

export async function tokenBucket(
  redis: Redis,
  key: string,
  capacity: number,
  refillRate: number,
  now: number,
): Promise<0 | 1> {
  const result = await (redis as import('ioredis').Redis).evalTokenBucket(
    key,
    capacity,
    refillRate,
    now,
  );
  return result as 0 | 1;
}
