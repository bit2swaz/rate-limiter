import { redis, disconnect } from '../../src/services/redisClient';
import { slidingWindow } from '../../src/algorithms/slidingWindow';

afterAll(() => disconnect());

const base = `test:p2:sw:${Date.now()}`;

afterEach(async () => {
  const keys = await redis.keys(`${base}:*`);
  if (keys.length > 0) await redis.del(...keys);
});

describe('slidingWindow', () => {
  it('allows requests within the window and limit', async () => {
    const key = `${base}:basic`;
    const result = await slidingWindow(redis, key, 60000, 5, Date.now());
    expect(result).toBe(1);
  });

  it('rejects requests at the limit', async () => {
    const key = `${base}:atlimit`;
    const limit = 3;

    for (let i = 0; i < limit; i++) {
      await slidingWindow(redis, key, 60000, limit, Date.now() + i);
    }
    const result = await slidingWindow(redis, key, 60000, limit, Date.now() + limit);
    expect(result).toBe(0);
  });

  it('allows exactly limit requests then rejects', async () => {
    const key = `${base}:exact`;
    const limit = 4;
    const results: number[] = [];

    for (let i = 0; i < limit + 1; i++) {
      results.push(await slidingWindow(redis, key, 60000, limit, Date.now() + i));
    }

    expect(results.slice(0, limit).every((r) => r === 1)).toBe(true);
    expect(results[limit]).toBe(0);
  });

  it('prunes old entries outside the window so new requests succeed', async () => {
    const key = `${base}:prune`;
    const limit = 2;
    const windowMs = 500;

    // add entries that will fall outside the window
    const tOld = Date.now() - 1000;
    await slidingWindow(redis, key, windowMs, limit, tOld);
    await slidingWindow(redis, key, windowMs, limit, tOld + 1);

    // entries are old — new requests in the current window should be allowed
    const tNow = Date.now();
    expect(await slidingWindow(redis, key, windowMs, limit, tNow)).toBe(1);
    expect(await slidingWindow(redis, key, windowMs, limit, tNow + 1)).toBe(1);
    // now at limit inside current window
    expect(await slidingWindow(redis, key, windowMs, limit, tNow + 2)).toBe(0);
  });

  it('allows requests again after window slides past old entries', async () => {
    const key = `${base}:slide`;
    const limit = 2;
    const windowMs = 200; // 200ms window

    const t0 = Date.now();
    await slidingWindow(redis, key, windowMs, limit, t0);
    await slidingWindow(redis, key, windowMs, limit, t0 + 1);
    // at limit — next should be rejected
    expect(await slidingWindow(redis, key, windowMs, limit, t0 + 2)).toBe(0);

    // wait for the window to slide past both entries
    await new Promise((r) => setTimeout(r, 250));
    const tNew = Date.now();
    expect(await slidingWindow(redis, key, windowMs, limit, tNew)).toBe(1);
  });

  it('concurrent requests do not exceed the limit', async () => {
    const key = `${base}:concurrency`;
    const limit = 10;
    const total = 20;
    const now = Date.now();

    const results = await Promise.all(
      Array.from({ length: total }, (_, i) =>
        slidingWindow(redis, key, 60000, limit, now + i),
      ),
    );

    const allowed = results.filter((r) => r === 1).length;
    const rejected = results.filter((r) => r === 0).length;
    expect(allowed).toBe(limit);
    expect(rejected).toBe(total - limit);
  });
});
