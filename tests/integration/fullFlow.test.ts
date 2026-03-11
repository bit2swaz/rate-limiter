/**
 * phase 7.1 — full api integration tests
 *
 * exercises the complete stack: http auth → rule creation → proxy requests → 429.
 * each describe block is self-contained with its own unique keys and cleanup.
 */
import request from 'supertest';
import app from '../../src/app';
import { redis, disconnect } from '../../src/services/redisClient';
import { signToken } from '../../src/auth/jwtMiddleware';
import { deleteRule } from '../../src/services/ruleService';

const base = `test-p7-flow-${Date.now()}`;

afterAll(async () => {
  await disconnect();
});

async function cleanupKey(key: string): Promise<void> {
  await redis.del(`rl:${key}`);
  await deleteRule(key);
}

// ---------------------------------------------------------------------------
// full e2e happy path — uses the real POST /auth/token endpoint
// ---------------------------------------------------------------------------
describe('full e2e - fixed_window (uses http auth endpoint)', () => {
  const testKey = `${base}:fw`;

  afterAll(async () => {
    await cleanupKey(testKey);
  });

  it('authenticates, creates rule, allows N requests, then 429 on N+1', async () => {
    // 1. get jwt via the http endpoint
    const authRes = await request(app)
      .post('/auth/token')
      .send({ username: process.env.ADMIN_USER ?? 'admin', password: process.env.ADMIN_PASS ?? 'admin' });
    expect(authRes.status).toBe(200);
    const token = authRes.body.token as string;

    // 2. create rule
    const ruleRes = await request(app)
      .post('/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ apiKey: testKey, algorithm: 'fixed_window', limit: 3, windowMs: 60000 });
    expect(ruleRes.status).toBe(201);

    // 3. exhaust quota
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
      expect(res.status).toBe(200);
    }

    // 4. next request must be rejected
    const rejected = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(rejected.status).toBe(429);
    expect(rejected.body.error).toBe('rate limit exceeded');
  });
});

// ---------------------------------------------------------------------------
// token_bucket
// ---------------------------------------------------------------------------
describe('full e2e - token_bucket', () => {
  const testKey = `${base}:tb`;
  const token = signToken({ sub: 'admin', role: 'admin' });

  afterAll(async () => {
    await cleanupKey(testKey);
  });

  it('allows up to capacity then rejects on depletion', async () => {
    await request(app)
      .post('/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ apiKey: testKey, algorithm: 'token_bucket', capacity: 3, refillRate: 0.001 });

    for (let i = 0; i < 3; i++) {
      expect((await request(app).get('/proxy/test').set('x-api-key', testKey)).status).toBe(200);
    }

    const rejected = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(rejected.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// sliding_window
// ---------------------------------------------------------------------------
describe('full e2e - sliding_window', () => {
  const testKey = `${base}:sw`;
  const token = signToken({ sub: 'admin', role: 'admin' });

  afterAll(async () => {
    await cleanupKey(testKey);
  });

  it('allows up to limit then rejects', async () => {
    await request(app)
      .post('/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ apiKey: testKey, algorithm: 'sliding_window', limit: 3, windowMs: 60000 });

    for (let i = 0; i < 3; i++) {
      expect((await request(app).get('/proxy/test').set('x-api-key', testKey)).status).toBe(200);
    }

    const rejected = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(rejected.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// rule update: increase limit allows traffic after reset
// ---------------------------------------------------------------------------
describe('full e2e - rule update', () => {
  const testKey = `${base}:update`;
  const token = signToken({ sub: 'admin', role: 'admin' });

  afterAll(async () => {
    await cleanupKey(testKey);
  });

  it('increasing the limit (after window reset) unblocks traffic', async () => {
    await request(app)
      .post('/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ apiKey: testKey, algorithm: 'fixed_window', limit: 2, windowMs: 60000 });

    // exhaust limit
    for (let i = 0; i < 2; i++) {
      await request(app).get('/proxy/test').set('x-api-key', testKey);
    }
    expect((await request(app).get('/proxy/test').set('x-api-key', testKey)).status).toBe(429);

    // update rule to higher limit
    const updateRes = await request(app)
      .put(`/rules/${testKey}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ limit: 20 });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.limit).toBe(20);

    // reset the rate limit window so the counter restarts
    await redis.del(`rl:${testKey}`);

    // should now be allowed
    const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// rule deletion: deleted rule causes 401
// ---------------------------------------------------------------------------
describe('full e2e - rule deletion', () => {
  const testKey = `${base}:delete`;
  const token = signToken({ sub: 'admin', role: 'admin' });

  afterAll(async () => {
    await cleanupKey(testKey);
  });

  it('deleted rule results in 401 on the next request', async () => {
    await request(app)
      .post('/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ apiKey: testKey, algorithm: 'fixed_window', limit: 10, windowMs: 60000 });

    // confirm key works
    expect((await request(app).get('/proxy/test').set('x-api-key', testKey)).status).toBe(200);

    // delete the rule
    const delRes = await request(app)
      .delete(`/rules/${testKey}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(204);

    // subsequent requests must now return 401
    const res = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(res.status).toBe(401);
  });
});
