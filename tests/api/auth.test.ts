import request from 'supertest';
import app from '../../src/app';
import { redis, disconnect } from '../../src/services/redisClient';
import { signToken } from '../../src/auth/jwtMiddleware';

afterAll(async () => {
  // clean up any keys created during middleware tests
  const keys = await redis.keys('rl:keys');
  if (keys.length > 0) await redis.del(...(keys as [string, ...string[]]));
  await disconnect();
});

describe('POST /auth/token', () => {
  it('returns 401 when credentials are missing', async () => {
    const res = await request(app).post('/auth/token').send({});
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('returns 401 for wrong credentials', async () => {
    const res = await request(app)
      .post('/auth/token')
      .send({ username: 'wrong', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('returns a signed JWT for valid admin credentials', async () => {
    const res = await request(app)
      .post('/auth/token')
      .send({
        username: process.env.ADMIN_USER ?? 'admin',
        password: process.env.ADMIN_PASS ?? 'admin',
      });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.split('.')).toHaveLength(3);
  });
});

describe('jwtMiddleware', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app).post('/keys');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed token', async () => {
    const res = await request(app)
      .post('/keys')
      .set('Authorization', 'Bearer not.a.real.jwt');
    expect(res.status).toBe(401);
  });

  it('returns 401 for token with wrong secret', async () => {
    // manually craft a token signed with different secret
    const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
    const badToken = jwt.sign({ sub: 'admin', role: 'admin' }, 'wrong-secret', {
      expiresIn: '1h',
    });
    const res = await request(app)
      .post('/keys')
      .set('Authorization', `Bearer ${badToken}`);
    expect(res.status).toBe(401);
  });

  it('passes through with a valid JWT and reaches the route', async () => {
    const token = signToken({ sub: 'admin', role: 'admin' });
    const res = await request(app)
      .post('/keys')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(201);
    expect(res.body.apiKey).toBeDefined();
  });
});
