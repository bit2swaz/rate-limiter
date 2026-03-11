/**
 * phase 7.1 — response headers integration tests
 *
 * verifies X-RateLimit-Limit, X-RateLimit-Remaining, and Retry-After
 * are set correctly at each step of a request sequence for all 3 algorithms.
 */
import request from 'supertest';
import app from '../../src/app';
import { redis, disconnect } from '../../src/services/redisClient';
import { createRule, deleteRule } from '../../src/services/ruleService';

const base = `test-p7-headers-${Date.now()}`;

afterAll(async () => {
  await disconnect();
});

async function cleanup(key: string): Promise<void> {
  await redis.del(`rl:${key}`);
  await deleteRule(key);
}

// ---------------------------------------------------------------------------
// fixed_window
// ---------------------------------------------------------------------------
describe('headers - fixed_window sequence', () => {
  const testKey = `${base}:fw`;

  beforeAll(async () => {
    await createRule({ apiKey: testKey, algorithm: 'fixed_window', limit: 3, windowMs: 60000 });
  });

  // reset rate limit counter before each test so assertions are deterministic
  beforeEach(async () => {
    await redis.del(`rl:${testKey}`);
  });

  afterAll(async () => {
    await cleanup(testKey);
  });

  it('X-RateLimit-Limit is the configured limit', async () => {
    const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(res.headers['x-ratelimit-limit']).toBe('3');
  });

  it('X-RateLimit-Remaining decrements with each request', async () => {
    const r1 = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(r1.headers['x-ratelimit-remaining']).toBe('2');

    const r2 = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(r2.headers['x-ratelimit-remaining']).toBe('1');

    const r3 = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(r3.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('Retry-After is present and positive on 429', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app).get('/proxy/test').set('x-api-key', testKey);
    }
    const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('X-RateLimit-Limit and Remaining are also set on 429 responses', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app).get('/proxy/test').set('x-api-key', testKey);
    }
    const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(res.status).toBe(429);
    expect(res.headers['x-ratelimit-limit']).toBe('3');
    expect(res.headers['x-ratelimit-remaining']).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// token_bucket
// ---------------------------------------------------------------------------
describe('headers - token_bucket sequence', () => {
  const testKey = `${base}:tb`;

  beforeAll(async () => {
    await createRule({ apiKey: testKey, algorithm: 'token_bucket', capacity: 3, refillRate: 0 });
  });

  beforeEach(async () => {
    await redis.del(`rl:${testKey}`);
  });

  afterAll(async () => {
    await cleanup(testKey);
  });

  it('X-RateLimit-Limit is the configured capacity', async () => {
    const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(res.headers['x-ratelimit-limit']).toBe('3');
  });

  it('X-RateLimit-Remaining decrements with each request', async () => {
    const r1 = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(r1.headers['x-ratelimit-remaining']).toBe('2');

    const r2 = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(r2.headers['x-ratelimit-remaining']).toBe('1');

    const r3 = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(r3.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('Retry-After is set on 429', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app).get('/proxy/test').set('x-api-key', testKey);
    }
    const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// sliding_window
// ---------------------------------------------------------------------------
describe('headers - sliding_window sequence', () => {
  const testKey = `${base}:sw`;

  beforeAll(async () => {
    await createRule({ apiKey: testKey, algorithm: 'sliding_window', limit: 3, windowMs: 60000 });
  });

  beforeEach(async () => {
    await redis.del(`rl:${testKey}`);
  });

  afterAll(async () => {
    await cleanup(testKey);
  });

  it('X-RateLimit-Limit is the configured limit', async () => {
    const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(res.headers['x-ratelimit-limit']).toBe('3');
  });

  it('X-RateLimit-Remaining decrements with each request', async () => {
    const r1 = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(r1.headers['x-ratelimit-remaining']).toBe('2');

    const r2 = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(r2.headers['x-ratelimit-remaining']).toBe('1');

    const r3 = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(r3.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('Retry-After is set on 429', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app).get('/proxy/test').set('x-api-key', testKey);
    }
    const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});
