import { redis, disconnect } from '../../src/services/redisClient';
import { tokenBucket } from '../../src/algorithms/tokenBucket';

afterAll(() => disconnect());

const base = `test:p2:tb:${Date.now()}`;

afterEach(async () => {
  const keys = await redis.keys(`${base}:*`);
  if (keys.length > 0) await redis.del(...keys);
});

describe('tokenBucket', () => {
  it('allows requests up to capacity', async () => {
    const key = `${base}:basic`;
    const result = await tokenBucket(redis, key, 5, 1, Date.now());
    expect(result).toBe(1);
  });

  it('depletes and rejects when bucket is empty', async () => {
    const key = `${base}:deplete`;
    const capacity = 3;
    const now = Date.now();

    for (let i = 0; i < capacity; i++) {
      await tokenBucket(redis, key, capacity, 0, now);
    }
    const result = await tokenBucket(redis, key, capacity, 0, now);
    expect(result).toBe(0);
  });

  it('allows exactly capacity requests then rejects', async () => {
    const key = `${base}:exact`;
    const capacity = 4;
    const now = Date.now();
    const results: number[] = [];

    for (let i = 0; i < capacity + 1; i++) {
      results.push(await tokenBucket(redis, key, capacity, 0, now));
    }

    expect(results.slice(0, capacity).every((r) => r === 1)).toBe(true);
    expect(results[capacity]).toBe(0);
  });

  it('refills tokens over elapsed time', async () => {
    const key = `${base}:refill`;
    const capacity = 5;
    const refillRate = 5; // 5 tokens/sec
    const t0 = Date.now();

    // drain completely
    for (let i = 0; i < capacity; i++) {
      await tokenBucket(redis, key, capacity, refillRate, t0);
    }
    expect(await tokenBucket(redis, key, capacity, refillRate, t0)).toBe(0);

    // simulate 1 second passing
    const t1 = t0 + 1000;
    expect(await tokenBucket(redis, key, capacity, refillRate, t1)).toBe(1);
  });

  it('partial refill works (less than 1 full token should not allow)', async () => {
    const key = `${base}:partial`;
    const capacity = 1;
    const refillRate = 2; // 2 tokens/sec => 1 token per 500ms
    const t0 = Date.now();

    await tokenBucket(redis, key, capacity, refillRate, t0);
    expect(await tokenBucket(redis, key, capacity, refillRate, t0)).toBe(0);

    // only 200ms elapsed => 0.4 tokens earned, still not enough
    const t1 = t0 + 200;
    expect(await tokenBucket(redis, key, capacity, refillRate, t1)).toBe(0);

    // 600ms elapsed => 1.2 tokens earned, enough
    const t2 = t0 + 600;
    expect(await tokenBucket(redis, key, capacity, refillRate, t2)).toBe(1);
  });

  it('never overfills beyond capacity', async () => {
    const key = `${base}:overfill`;
    const capacity = 3;
    const refillRate = 100; // fast refill
    const t0 = Date.now();

    await tokenBucket(redis, key, capacity, refillRate, t0);

    // simulate a very long elapsed time (10 seconds)
    const tLong = t0 + 10000;
    // consume capacity+1 requests: only capacity should be allowed
    let allowed = 0;
    for (let i = 0; i < capacity + 1; i++) {
      const r = await tokenBucket(redis, key, capacity, refillRate, tLong + i);
      if (r === 1) allowed++;
    }
    expect(allowed).toBe(capacity);
  });

  it('concurrent requests do not exceed capacity', async () => {
    const key = `${base}:concurrency`;
    const capacity = 10;
    const total = 20;
    const now = Date.now();

    const results = await Promise.all(
      Array.from({ length: total }, () => tokenBucket(redis, key, capacity, 0, now)),
    );

    const allowed = results.filter((r) => r === 1).length;
    const rejected = results.filter((r) => r === 0).length;
    expect(allowed).toBe(capacity);
    expect(rejected).toBe(total - capacity);
  });
});
