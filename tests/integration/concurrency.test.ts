/**
 * phase 7.2 — concurrency / race condition tests
 *
 * fires 50 concurrent http requests against a limit of 10 for each algorithm.
 * asserts exactly 10 are allowed and 40 are rejected (zero tolerance).
 *
 * this is the proof that lua atomicity prevents over-counting under load.
 * a persistent http.Server is used so all 50 requests share one bound port.
 */
import * as http from 'http';
import supertest from 'supertest';
import app from '../../src/app';
import { redis, disconnect } from '../../src/services/redisClient';
import { createRule, deleteRule } from '../../src/services/ruleService';

const base = `test-p7-conc-${Date.now()}`;
const TOTAL = 50;
const LIMIT = 10;

// give concurrency tests more time — 50 parallel http requests can be slow
jest.setTimeout(20000);

let server: http.Server;

beforeAll((done) => {
  server = app.listen(0, done);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await disconnect();
});

async function cleanupKey(key: string): Promise<void> {
  await redis.del(`rl:${key}`);
  await deleteRule(key);
}

/**
 * fires `count` concurrent get requests to /proxy/concurrent against the given api key.
 * returns the count of 200 and 429 responses.
 */
async function fireRequests(
  key: string,
  count: number,
): Promise<{ allowed: number; rejected: number }> {
  const responses = await Promise.all(
    Array.from({ length: count }, () =>
      supertest(server).get('/proxy/concurrent').set('x-api-key', key),
    ),
  );
  const allowed = responses.filter((r) => r.status === 200).length;
  const rejected = responses.filter((r) => r.status === 429).length;
  return { allowed, rejected };
}

// ---------------------------------------------------------------------------
// fixed_window
// ---------------------------------------------------------------------------
describe('concurrency - fixed_window', () => {
  const testKey = `${base}:fw`;

  beforeAll(async () => {
    await createRule({ apiKey: testKey, algorithm: 'fixed_window', limit: LIMIT, windowMs: 60000 });
  });

  afterAll(async () => {
    await cleanupKey(testKey);
  });

  it(`allows exactly ${LIMIT} of ${TOTAL} concurrent requests`, async () => {
    const { allowed, rejected } = await fireRequests(testKey, TOTAL);
    expect(allowed).toBe(LIMIT);
    expect(rejected).toBe(TOTAL - LIMIT);
  });
});

// ---------------------------------------------------------------------------
// token_bucket
// ---------------------------------------------------------------------------
describe('concurrency - token_bucket', () => {
  const testKey = `${base}:tb`;

  beforeAll(async () => {
    await createRule({ apiKey: testKey, algorithm: 'token_bucket', capacity: LIMIT, refillRate: 0 });
  });

  afterAll(async () => {
    await cleanupKey(testKey);
  });

  it(`allows exactly ${LIMIT} of ${TOTAL} concurrent requests`, async () => {
    const { allowed, rejected } = await fireRequests(testKey, TOTAL);
    expect(allowed).toBe(LIMIT);
    expect(rejected).toBe(TOTAL - LIMIT);
  });
});

// ---------------------------------------------------------------------------
// sliding_window
// ---------------------------------------------------------------------------
describe('concurrency - sliding_window', () => {
  const testKey = `${base}:sw`;

  beforeAll(async () => {
    await createRule({ apiKey: testKey, algorithm: 'sliding_window', limit: LIMIT, windowMs: 60000 });
  });

  afterAll(async () => {
    await cleanupKey(testKey);
  });

  it(`allows exactly ${LIMIT} of ${TOTAL} concurrent requests`, async () => {
    const { allowed, rejected } = await fireRequests(testKey, TOTAL);
    expect(allowed).toBe(LIMIT);
    expect(rejected).toBe(TOTAL - LIMIT);
  });
});
