import request from 'supertest';
import app from '../../src/app';
import { redis, disconnect } from '../../src/services/redisClient';
import { signToken } from '../../src/auth/jwtMiddleware';

const testKey = `test-p3-rules-${Date.now()}`;
let token: string;

beforeAll(() => {
  token = signToken({ sub: 'admin', role: 'admin' });
});

afterEach(async () => {
  await redis.del(`rl:rule:${testKey}`);
});

afterAll(async () => {
  await disconnect();
});

describe('POST /rules', () => {
  it('returns 401 without JWT', async () => {
    const res = await request(app)
      .post('/rules')
      .send({ apiKey: testKey, algorithm: 'fixed_window', limit: 10, windowMs: 60000 });
    expect(res.status).toBe(401);
  });

  it('returns 201 with created rule on valid JWT and body', async () => {
    const res = await request(app)
      .post('/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ apiKey: testKey, algorithm: 'sliding_window', limit: 100, windowMs: 60000 });
    expect(res.status).toBe(201);
    expect(res.body.apiKey).toBe(testKey);
    expect(res.body.algorithm).toBe('sliding_window');
    expect(res.body.limit).toBe(100);
  });

  it('returns 400 when algorithm-required fields are missing', async () => {
    const res = await request(app)
      .post('/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ apiKey: testKey, algorithm: 'fixed_window' }); // missing limit and windowMs
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 for an invalid algorithm value', async () => {
    const res = await request(app)
      .post('/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ apiKey: testKey, algorithm: 'unknown_algo', limit: 10, windowMs: 60000 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for token_bucket missing capacity', async () => {
    const res = await request(app)
      .post('/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ apiKey: testKey, algorithm: 'token_bucket', refillRate: 5 }); // missing capacity
    expect(res.status).toBe(400);
  });
});

describe('GET /rules/:key', () => {
  it('returns 200 with rule for existing key', async () => {
    await request(app)
      .post('/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ apiKey: testKey, algorithm: 'fixed_window', limit: 10, windowMs: 60000 });
    const res = await request(app)
      .get(`/rules/${testKey}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.apiKey).toBe(testKey);
    expect(res.body.algorithm).toBe('fixed_window');
  });

  it('returns 404 for unknown key', async () => {
    const res = await request(app)
      .get('/rules/does-not-exist-xyz-p3')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('PUT /rules/:key', () => {
  it('returns 200 with the updated rule', async () => {
    await request(app)
      .post('/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ apiKey: testKey, algorithm: 'fixed_window', limit: 10, windowMs: 60000 });
    const res = await request(app)
      .put(`/rules/${testKey}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ limit: 200 });
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(200);
    expect(res.body.windowMs).toBe(60000);
  });

  it('returns 404 when updating a non-existent rule', async () => {
    const res = await request(app)
      .put('/rules/does-not-exist-xyz-p3')
      .set('Authorization', `Bearer ${token}`)
      .send({ limit: 200 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /rules/:key', () => {
  it('returns 204 after successful deletion', async () => {
    await request(app)
      .post('/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ apiKey: testKey, algorithm: 'fixed_window', limit: 10, windowMs: 60000 });
    const res = await request(app)
      .delete(`/rules/${testKey}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('rule is gone after deletion', async () => {
    await request(app)
      .post('/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ apiKey: testKey, algorithm: 'fixed_window', limit: 10, windowMs: 60000 });
    await request(app)
      .delete(`/rules/${testKey}`)
      .set('Authorization', `Bearer ${token}`);
    const getRes = await request(app)
      .get(`/rules/${testKey}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(404);
  });

  it('returns 404 when deleting a non-existent rule', async () => {
    const res = await request(app)
      .delete('/rules/does-not-exist-xyz-p3')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
