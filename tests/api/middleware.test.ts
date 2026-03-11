import request from 'supertest';
import app from '../../src/app';
import { redis, disconnect } from '../../src/services/redisClient';
import { createRule, deleteRule } from '../../src/services/ruleService';

const testKey = `test-p4-mw-${Date.now()}`;

/** delete rate limit state + rule for this test key */
async function cleanupKey(): Promise<void> {
  await redis.del(`rl:${testKey}`);
  await deleteRule(testKey);
}

afterAll(async () => {
  await cleanupKey();
  await disconnect();
});

// ---------------------------------------------------------------------------
// 4.1 — auth checks
// ---------------------------------------------------------------------------
describe('rateLimitMiddleware - auth checks', () => {
  it('returns 401 when x-api-key header is missing', async () => {
    const res = await request(app).get('/proxy/anything');
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('returns 401 when api key has no configured rule', async () => {
    const res = await request(app)
      .get('/proxy/anything')
      .set('x-api-key', 'totally-unknown-key-xyz-p4');
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 4.1 + 4.2 — fixed_window algorithm + headers
// ---------------------------------------------------------------------------
describe('rateLimitMiddleware - fixed_window', () => {
  beforeEach(async () => {
    await cleanupKey();
    await createRule({ apiKey: testKey, algorithm: 'fixed_window', limit: 3, windowMs: 60000 });
  });

  it('allows a request within the limit', async () => {
    const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(res.status).toBe(200);
  });

  it('returns 429 when limit is exceeded', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app).get('/proxy/test').set('x-api-key', testKey);
    }
    const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('rate limit exceeded');
  });

  it('sets X-RateLimit-Limit header on allowed requests', async () => {
    const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(res.headers['x-ratelimit-limit']).toBe('3');
  });

  it('sets X-RateLimit-Remaining and decrements each request', async () => {
    const r1 = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(r1.headers['x-ratelimit-remaining']).toBe('2');

    const r2 = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(r2.headers['x-ratelimit-remaining']).toBe('1');

    const r3 = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(r3.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('sets Retry-After header on 429', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app).get('/proxy/test').set('x-api-key', testKey);
    }
    const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 4.1 + 4.2 — token_bucket algorithm + headers
// ---------------------------------------------------------------------------
describe('rateLimitMiddleware - token_bucket', () => {
  beforeEach(async () => {
    await cleanupKey();
    await createRule({ apiKey: testKey, algorithm: 'token_bucket', capacity: 2, refillRate: 0 });
  });

  it('allows requests up to capacity', async () => {
    const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(res.status).toBe(200);
  });

  it('returns 429 when bucket is depleted', async () => {
    await request(app).get('/proxy/test').set('x-api-key', testKey);
    await request(app).get('/proxy/test').set('x-api-key', testKey);
    const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('rate limit exceeded');
  });

  it('sets X-RateLimit-Limit to capacity', async () => {
    const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(res.headers['x-ratelimit-limit']).toBe('2');
  });

  it('sets X-RateLimit-Remaining correctly (decrements per request)', async () => {
    const r1 = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(r1.headers['x-ratelimit-remaining']).toBe('1');

    const r2 = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(r2.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('sets Retry-After on 429', async () => {
    await request(app).get('/proxy/test').set('x-api-key', testKey);
    await request(app).get('/proxy/test').set('x-api-key', testKey);
    const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 4.1 + 4.2 — sliding_window algorithm + headers
// ---------------------------------------------------------------------------
describe('rateLimitMiddleware - sliding_window', () => {
  beforeEach(async () => {
    await cleanupKey();
    await createRule({ apiKey: testKey, algorithm: 'sliding_window', limit: 3, windowMs: 60000 });
  });

  it('allows a request within limit', async () => {
    const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(res.status).toBe(200);
  });

  it('returns 429 when limit is exceeded', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app).get('/proxy/test').set('x-api-key', testKey);
    }
    const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('rate limit exceeded');
  });

  it('sets X-RateLimit-Remaining correctly', async () => {
    const r1 = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(r1.headers['x-ratelimit-remaining']).toBe('2');
  });

  it('sets X-RateLimit-Limit header', async () => {
    const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(res.headers['x-ratelimit-limit']).toBe('3');
  });
});

// ---------------------------------------------------------------------------
// 4.3 — proxy route
// ---------------------------------------------------------------------------
describe('/proxy/* route', () => {
  beforeEach(async () => {
    await cleanupKey();
    await createRule({ apiKey: testKey, algorithm: 'fixed_window', limit: 10, windowMs: 60000 });
  });

  it('returns 200 with { message: ok } for GET /proxy/anything', async () => {
    const res = await request(app).get('/proxy/anything').set('x-api-key', testKey);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('ok');
  });

  it('returns 200 for POST /proxy/data', async () => {
    const res = await request(app).post('/proxy/data').set('x-api-key', testKey);
    expect(res.status).toBe(200);
  });

  it('returns 200 for DELETE /proxy/resource', async () => {
    const res = await request(app).delete('/proxy/resource').set('x-api-key', testKey);
    expect(res.status).toBe(200);
  });

  it('returns 401 without x-api-key header', async () => {
    const res = await request(app).get('/proxy/anything');
    expect(res.status).toBe(401);
  });

  it('returns 429 after exhausting quota', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app).get('/proxy/test').set('x-api-key', testKey);
    }
    const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(res.status).toBe(429);
  });
});
