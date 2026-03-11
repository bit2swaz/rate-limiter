// fixed window algorithm - implemented in phase 2
import type Redis from 'ioredis';

export async function fixedWindow(
  redis: Redis,
  key: string,
  limit: number,
  windowMs: number,
): Promise<0 | 1> {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, windowMs);
  }
  return count <= limit ? 1 : 0;
}
