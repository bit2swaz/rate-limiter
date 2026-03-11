import { redis, disconnect } from '../../src/services/redisClient';
import { fixedWindow } from '../../src/algorithms/fixedWindow';

afterAll(() => disconnect());

const base = `test:p2:fw:${Date.now()}`;

afterEach(async () => {
  const keys = await redis.keys(`${base}:*`);
  if (keys.length > 0) await redis.del(...keys);
});

describe('fixedWindow', () => {
  it('allows requests within the limit', async () => {
    const key = `${base}:basic`;
    const result = await fixedWindow(redis, key, 5, 60000);
    expect(result).toBe(1);
  });

  it('rejects requests that exceed the limit', async () => {
    const key = `${base}:exceed`;
    for (let i = 0; i < 3; i++) {
      await fixedWindow(redis, key, 3, 60000);
    }
    const result = await fixedWindow(redis, key, 3, 60000);
    expect(result).toBe(0);
  });

  it('allows exactly limit requests and rejects the next one', async () => {
    const key = `${base}:exact`;
    const limit = 4;
    const results: number[] = [];
    for (let i = 0; i < limit + 1; i++) {
      results.push(await fixedWindow(redis, key, limit, 60000));
    }
    expect(results.slice(0, limit).every((r) => r === 1)).toBe(true);
    expect(results[limit]).toBe(0);
  });

  it('resets counter after the window expires', async () => {
    const key = `${base}:reset`;
    // exhaust limit with a 100ms window
    await fixedWindow(redis, key, 1, 100);
    const rejected = await fixedWindow(redis, key, 1, 100);
    expect(rejected).toBe(0);

    // wait for the window to expire
    await new Promise((r) => setTimeout(r, 150));
    const allowed = await fixedWindow(redis, key, 1, 100);
    expect(allowed).toBe(1);
  });

  it('concurrent requests do not exceed the limit', async () => {
    const key = `${base}:concurrency`;
    const limit = 10;
    const total = 25;

    const results = await Promise.all(
      Array.from({ length: total }, () => fixedWindow(redis, key, limit, 60000)),
    );

    const allowed = results.filter((r) => r === 1).length;
    const rejected = results.filter((r) => r === 0).length;
    expect(allowed).toBe(limit);
    expect(rejected).toBe(total - limit);
  });
});
