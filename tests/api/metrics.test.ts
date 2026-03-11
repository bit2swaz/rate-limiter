import request from 'supertest';
import app from '../../src/app';
import { redis, disconnect } from '../../src/services/redisClient';
import { createRule, deleteRule } from '../../src/services/ruleService';

const testKey = `test-p5-metrics-${Date.now()}`;

beforeAll(async () => {
  await createRule({ apiKey: testKey, algorithm: 'fixed_window', limit: 20, windowMs: 60000 });
});

beforeEach(async () => {
  // reset rate limit state so each test starts with a fresh window
  await redis.del(`rl:${testKey}`);
});

afterAll(async () => {
  await redis.del(`rl:${testKey}`);
  await deleteRule(testKey);
  await disconnect();
});

// ---------------------------------------------------------------------------
// 5.1 — /metrics endpoint
// ---------------------------------------------------------------------------
describe('GET /metrics', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
  });

  it('responds with text/plain content-type', async () => {
    const res = await request(app).get('/metrics');
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });

  it('body contains process_cpu_seconds_total (default metrics)', async () => {
    const res = await request(app).get('/metrics');
    expect(res.text).toContain('process_cpu_seconds_total');
  });
});

// ---------------------------------------------------------------------------
// 5.2 — counter instrumentation
// ---------------------------------------------------------------------------
describe('metrics instrumentation - counters', () => {
  it('ratelimiter_requests_total appears after an allowed request', async () => {
    await request(app).get('/proxy/test').set('x-api-key', testKey);
    const res = await request(app).get('/metrics');
    expect(res.text).toContain('ratelimiter_requests_total');
  });

  it('ratelimiter_rejections_total appears after a rejected request', async () => {
    // exhaust the limit
    for (let i = 0; i < 20; i++) {
      await request(app).get('/proxy/test').set('x-api-key', testKey);
    }
    const rejected = await request(app).get('/proxy/test').set('x-api-key', testKey);
    expect(rejected.status).toBe(429);

    const res = await request(app).get('/metrics');
    expect(res.text).toContain('ratelimiter_rejections_total');
  });

  it('labels api_key and algorithm are present in ratelimiter_requests_total output', async () => {
    await request(app).get('/proxy/test').set('x-api-key', testKey);
    const res = await request(app).get('/metrics');
    expect(res.text).toContain('ratelimiter_requests_total{');
    expect(res.text).toContain('algorithm="fixed_window"');
  });
});

// ---------------------------------------------------------------------------
// 5.3 — histogram instrumentation
// ---------------------------------------------------------------------------
describe('metrics instrumentation - histogram', () => {
  it('ratelimiter_middleware_duration_seconds appears after requests', async () => {
    await request(app).get('/proxy/test').set('x-api-key', testKey);
    const res = await request(app).get('/metrics');
    expect(res.text).toContain('ratelimiter_middleware_duration_seconds_bucket');
  });

  it('histogram _sum and _count are present', async () => {
    await request(app).get('/proxy/test').set('x-api-key', testKey);
    const res = await request(app).get('/metrics');
    expect(res.text).toContain('ratelimiter_middleware_duration_seconds_sum');
    expect(res.text).toContain('ratelimiter_middleware_duration_seconds_count');
  });
});
