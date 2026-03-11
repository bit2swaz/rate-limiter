import request from 'supertest';
import app from '../../src/app';
import { redis, disconnect } from '../../src/services/redisClient';
import { signToken } from '../../src/auth/jwtMiddleware';

let token: string;
const createdKeys: string[] = [];

beforeAll(() => {
  token = signToken({ sub: 'admin', role: 'admin' });
});

afterAll(async () => {
  if (createdKeys.length > 0) {
    await redis.srem('rl:keys', ...createdKeys);
  }
  await disconnect();
});

describe('POST /keys', () => {
  it('returns 401 without JWT', async () => {
    const res = await request(app).post('/keys');
    expect(res.status).toBe(401);
  });

  it('returns 201 with apiKey on valid JWT', async () => {
    const res = await request(app)
      .post('/keys')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(201);
    expect(res.body.apiKey).toBeDefined();
    createdKeys.push(res.body.apiKey);
  });

  it('generated key matches format usr_[nanoid]', async () => {
    const res = await request(app)
      .post('/keys')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.apiKey).toMatch(/^usr_[a-zA-Z0-9_-]+$/);
    createdKeys.push(res.body.apiKey);
  });

  it('key is stored in redis set rl:keys', async () => {
    const res = await request(app)
      .post('/keys')
      .set('Authorization', `Bearer ${token}`);
    const apiKey = res.body.apiKey as string;
    createdKeys.push(apiKey);
    const isMember = await redis.sismember('rl:keys', apiKey);
    expect(isMember).toBe(1);
  });
});
