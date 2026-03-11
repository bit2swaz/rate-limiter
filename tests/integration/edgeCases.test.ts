/**
 * phase 7.3 — edge case tests
 *
 * covers failure modes and boundary conditions:
 * - redis throws during algorithm execution → 500
 * - corrupt rule in redis (unknown algorithm) → 500
 * - capacity: 0 in token bucket → immediate 429
 * - very large windowMs → correct redis TTL
 */
import request from 'supertest';
import app from '../../src/app';
import { redis, disconnect } from '../../src/services/redisClient';
import { createRule, deleteRule } from '../../src/services/ruleService';

const base = `test-p7-edge-${Date.now()}`;

afterAll(async () => {
  await disconnect();
});

async function cleanup(key: string): Promise<void> {
  await redis.del(`rl:${key}`);
  await deleteRule(key);
}

// ---------------------------------------------------------------------------
// redis error during algorithm execution
// ---------------------------------------------------------------------------
describe('edge case - redis error during algorithm execution', () => {
  const testKey = `${base}:redis-err`;

  beforeAll(async () => {
    await createRule({ apiKey: testKey, algorithm: 'token_bucket', capacity: 10, refillRate: 1 });
  });

  afterAll(async () => {
    await cleanup(testKey);
  });

  it('returns 500 when evalTokenBucket throws', async () => {
    // spy on the redis singleton — same object that the middleware uses
    const spy = jest
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .spyOn(redis as any, 'evalTokenBucket')
      .mockRejectedValueOnce(new Error('redis connection lost'));

    try {
      const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('internal server error');
    } finally {
      spy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// corrupt rule in redis (unknown algorithm stored directly)
// ---------------------------------------------------------------------------
describe('edge case - malformed rule in redis (unknown algorithm)', () => {
  const testKey = `${base}:corrupt`;

  beforeAll(async () => {
    // bypass the api and write a corrupt rule hash directly into redis
    await redis.hset(`rl:rule:${testKey}`, {
      apiKey: testKey,
      algorithm: 'bad_algorithm',
      limit: '10',
      windowMs: '60000',
    });
  });

  afterAll(async () => {
    await redis.del(`rl:rule:${testKey}`);
    await redis.del(`rl:${testKey}`);
  });

  it('returns 500 gracefully instead of crashing', async () => {
    const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal server error');
  });
});

// ---------------------------------------------------------------------------
// capacity: 0 in token bucket → immediate rejection
// ---------------------------------------------------------------------------
describe('edge case - capacity 0 in token bucket', () => {
  const testKey = `${base}:zero-cap`;

  beforeAll(async () => {
    await createRule({ apiKey: testKey, algorithm: 'token_bucket', capacity: 0, refillRate: 0 });
  });

  afterAll(async () => {
    await cleanup(testKey);
  });

  it('rejects the very first request immediately', async () => {
    const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('rate limit exceeded');
  });

  it('rejects on every subsequent attempt', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
      expect(res.status).toBe(429);
    }
  });
});

// ---------------------------------------------------------------------------
// very large windowMs → redis TTL is set proportionally
// ---------------------------------------------------------------------------
describe('edge case - very large windowMs (24h sliding window)', () => {
  const testKey = `${base}:ttl`;
  const windowMs = 24 * 60 * 60 * 1000; // 86_400_000 ms

  beforeAll(async () => {
    await createRule({ apiKey: testKey, algorithm: 'sliding_window', limit: 100, windowMs });
  });

  afterAll(async () => {
    await cleanup(testKey);
  });

  it('sets redis key TTL within expected range of windowMs', async () => {
    await request(app).get('/proxy/test').set('x-api-key', testKey);

    const ttl = await redis.pttl(`rl:${testKey}`);

    // TTL must be positive and within 5 seconds of the full window
    expect(ttl).toBeGreaterThan(windowMs - 5000);
    expect(ttl).toBeLessThanOrEqual(windowMs);
  });
});
