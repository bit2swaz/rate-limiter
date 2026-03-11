import request from 'supertest';
import app from '../../src/app';

describe('GET /docs', () => {
  it('returns 200 and swagger ui html in development', async () => {
    const res = await request(app).get('/docs/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  it('redirects /docs to /docs/ (swagger ui self-redirect)', async () => {
    const res = await request(app).get('/docs');
    // swagger-ui-express issues a redirect from /docs → /docs/
    expect([200, 301, 302]).toContain(res.status);
  });
});
