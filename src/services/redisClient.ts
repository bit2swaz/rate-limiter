import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';

// ---- module augmentation: add custom Lua commands to the Redis interface ----
declare module 'ioredis' {
  interface Redis {
    /**
     * Atomic token bucket check via Lua script.
     * @param key - Redis key for this bucket
     * @param capacity - max tokens
     * @param refillRate - tokens added per second
     * @param now - current timestamp in ms
     * @returns 1 if allowed, 0 if rejected
     */
    evalTokenBucket(
      key: string,
      capacity: number,
      refillRate: number,
      now: number,
    ): Promise<number>;

    /**
     * Atomic sliding window log check via Lua script.
     * @param key - Redis key for this window
     * @param windowMs - window size in milliseconds
     * @param limit - max requests per window
     * @param now - current timestamp in ms
     * @returns 1 if allowed, 0 if rejected
     */
    evalSlidingWindow(
      key: string,
      windowMs: number,
      limit: number,
      now: number,
    ): Promise<number>;
  }
}

// ---- Lua script loader ----
export function loadLuaScripts(client: Redis): void {
  const scriptsDir = path.resolve(__dirname, '../../scripts/lua');

  const tokenBucketLua = fs.readFileSync(path.join(scriptsDir, 'token_bucket.lua'), 'utf8');
  client.defineCommand('evalTokenBucket', { numberOfKeys: 1, lua: tokenBucketLua });

  const slidingWindowLua = fs.readFileSync(path.join(scriptsDir, 'sliding_window.lua'), 'utf8');
  client.defineCommand('evalSlidingWindow', { numberOfKeys: 1, lua: slidingWindowLua });
}

// ---- singleton ----
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

const client = new Redis(REDIS_URL, {
  // no cap on retries so the client keeps trying during reconnects
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false,
});

client.on('ready', () => {
  console.log('redis: connected and ready');
});

client.on('error', (err: Error) => {
  console.error('redis error:', err.message);
  // only force-exit in production; tests must be able to run
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

loadLuaScripts(client);

export const redis = client;

/**
 * Gracefully close the Redis connection.
 * Uses force-disconnect so ioredis does not attempt to reconnect.
 * Call this in test teardowns and on SIGTERM/SIGINT.
 */
export async function disconnect(): Promise<void> {
  redis.disconnect();
}
