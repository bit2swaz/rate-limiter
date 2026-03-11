import request from 'supertest';
import app from '../../src/app';
import { disconnect } from '../../src/services/redisClient';

afterAll(async () => {
  await disconnect();
});

// ---------------------------------------------------------------------------
// helmet security headers
// ---------------------------------------------------------------------------
describe('helmet security headers', () => {
  it('sets x-content-type-options: nosniff', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets x-frame-options', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('sets x-xss-protection or content-security-policy', async () => {
    const res = await request(app).get('/health');
    const hasXss = res.headers['x-xss-protection'] !== undefined;
    const hasCsp = res.headers['content-security-policy'] !== undefined;
    expect(hasXss || hasCsp).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// brute-force protection on POST /auth/token
// ---------------------------------------------------------------------------
describe('POST /auth/token rate limiting', () => {
  it('returns 429 after 10 rapid requests from same IP', async () => {
    // fire 11 requests — first 10 must succeed (or fail auth but not 429),
    // the 11th must be 429
    const results: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await request(app)
        .post('/auth/token')
        .set('x-forwarded-for', '10.0.0.1')
        .send({ username: 'admin', password: 'admin' });
      results.push(res.status);
    }
    expect(results[10]).toBe(429);
  });

  it('sets retry-after header on 429', async () => {
    // hammer with wrong creds to stay at 429 state from previous test
    const res = await request(app)
      .post('/auth/token')
      .set('x-forwarded-for', '10.0.0.1')
      .send({ username: 'x', password: 'x' });
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// global error handler
// ---------------------------------------------------------------------------
describe('global error handler', () => {
  it('returns 500 json for unhandled errors and does not leak stack traces', async () => {
    // the /health endpoint never throws — test via the test-only error trigger
    // added to app.ts in non-production mode
    const res = await request(app).get('/test-error');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal server error' });
    expect(res.body.stack).toBeUndefined();
  });
});
