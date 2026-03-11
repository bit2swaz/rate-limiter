import { redis, disconnect } from '../../src/services/redisClient';

afterAll(async () => {
  await disconnect();
});

describe('redis client - singleton', () => {
  it('connects and responds to ping', async () => {
    const result = await redis.ping();
    expect(result).toBe('PONG');
  });

  it('has a ready status after connecting', () => {
    expect(['ready', 'connect']).toContain(redis.status);
  });

  it('returns the same instance on repeated require calls', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../src/services/redisClient') as typeof import('../../src/services/redisClient');
    expect(mod.redis).toBe(redis);
  });
});

describe('redis client - lua script commands', () => {
  const base = `test:p1:${Date.now()}`;

  afterEach(async () => {
    const keys = await redis.keys(`${base}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  it('evalTokenBucket command is defined and returns 0 or 1', async () => {
    const result = await redis.evalTokenBucket(`${base}:tb`, 10, 1, Date.now());
    expect(Array.isArray(result)).toBe(true);
    expect([0, 1]).toContain(result[0]);
  });

  it('evalSlidingWindow command is defined and returns 0 or 1', async () => {
    const result = await redis.evalSlidingWindow(`${base}:sw`, 60000, 10, Date.now());
    expect(Array.isArray(result)).toBe(true);
    expect([0, 1]).toContain(result[0]);
  });

  it('evalTokenBucket allows requests up to capacity then rejects', async () => {
    const key = `${base}:tb:cap`;
    const capacity = 3;
    const now = Date.now();
    const results: [number, number][] = [];

    // refillRate=0 so no tokens are added between calls with same timestamp
    for (let i = 0; i < 5; i++) {
      results.push(await redis.evalTokenBucket(key, capacity, 0, now));
    }

    const allowed = results.filter((r) => r[0] === 1).length;
    const rejected = results.filter((r) => r[0] === 0).length;
    expect(allowed).toBe(3);
    expect(rejected).toBe(2);
  });

  it('evalSlidingWindow allows requests within limit then rejects', async () => {
    const key = `${base}:sw:cap`;
    const limit = 3;
    const results: [number, number][] = [];

    // each call gets a distinct timestamp so entries don't collide on ZADD score
    for (let i = 0; i < 5; i++) {
      results.push(await redis.evalSlidingWindow(key, 60000, limit, Date.now() + i));
    }

    const allowed = results.filter((r) => r[0] === 1).length;
    const rejected = results.filter((r) => r[0] === 0).length;
    expect(allowed).toBe(3);
    expect(rejected).toBe(2);
  });

  it('evalTokenBucket refills tokens over elapsed time', async () => {
    const key = `${base}:tb:refill`;
    const capacity = 5;
    const refillRate = 5; // 5 tokens per second

    const t0 = Date.now();
    // Drain to 0
    for (let i = 0; i < 5; i++) {
      await redis.evalTokenBucket(key, capacity, refillRate, t0);
    }

    // Verify it's empty
    const rejected = await redis.evalTokenBucket(key, capacity, refillRate, t0);
    expect(rejected[0]).toBe(0);

    // Simulate 1 second passing: should have 5 new tokens
    const t1 = t0 + 1000;
    const allowed = await redis.evalTokenBucket(key, capacity, refillRate, t1);
    expect(allowed[0]).toBe(1);
  });

  it('evalSlidingWindow prunes old entries outside the window', async () => {
    const key = `${base}:sw:prune`;
    const limit = 2;
    const windowMs = 1000; // 1 second window

    const tOld = Date.now() - 2000; // 2 seconds ago, outside window
    // Add entries that are outside the window
    await redis.evalSlidingWindow(key, windowMs, limit, tOld);
    await redis.evalSlidingWindow(key, windowMs, limit, tOld + 1);

    // Now make a request in the current window - old entries should be pruned
    const tNow = Date.now();
    const result = await redis.evalSlidingWindow(key, windowMs, limit, tNow);
    expect(result[0]).toBe(1); // should be allowed because old entries are gone
  });
});
