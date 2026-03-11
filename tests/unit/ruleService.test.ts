import { redis, disconnect } from '../../src/services/redisClient';
import { createRule, getRule, updateRule, deleteRule, Rule } from '../../src/services/ruleService';

const base = `test:p3:rs:${Date.now()}`;

afterEach(async () => {
  const keys = await redis.keys(`rl:rule:${base}:*`);
  if (keys.length > 0) await redis.del(...(keys as [string, ...string[]]));
});

afterAll(async () => {
  await disconnect();
});

describe('ruleService', () => {
  it('createRule stores a rule in redis', async () => {
    const rule: Rule = {
      apiKey: `${base}:key1`,
      algorithm: 'sliding_window',
      limit: 100,
      windowMs: 60000,
    };
    const result = await createRule(rule);
    expect(result).toEqual(rule);
    const stored = await redis.hgetall(`rl:rule:${base}:key1`);
    expect(stored.apiKey).toBe(rule.apiKey);
    expect(stored.algorithm).toBe('sliding_window');
  });

  it('getRule retrieves and deserializes a rule correctly', async () => {
    const rule: Rule = {
      apiKey: `${base}:key2`,
      algorithm: 'token_bucket',
      capacity: 10,
      refillRate: 2,
    };
    await createRule(rule);
    const result = await getRule(`${base}:key2`);
    expect(result).toEqual(rule);
    expect(typeof result!.capacity).toBe('number');
    expect(typeof result!.refillRate).toBe('number');
  });

  it('getRule returns null for non-existent key', async () => {
    const result = await getRule(`${base}:nonexistent`);
    expect(result).toBeNull();
  });

  it('updateRule merges partial updates and persists them', async () => {
    const rule: Rule = {
      apiKey: `${base}:key3`,
      algorithm: 'fixed_window',
      limit: 50,
      windowMs: 30000,
    };
    await createRule(rule);
    const updated = await updateRule(`${base}:key3`, { limit: 200 });
    expect(updated!.limit).toBe(200);
    expect(updated!.windowMs).toBe(30000);
    const fetched = await getRule(`${base}:key3`);
    expect(fetched!.limit).toBe(200);
    expect(fetched!.windowMs).toBe(30000);
  });

  it('updateRule returns null for unknown key', async () => {
    const result = await updateRule(`${base}:missing`, { limit: 10 });
    expect(result).toBeNull();
  });

  it('deleteRule removes the rule from redis', async () => {
    const rule: Rule = {
      apiKey: `${base}:key4`,
      algorithm: 'sliding_window',
      limit: 10,
      windowMs: 5000,
    };
    await createRule(rule);
    await deleteRule(`${base}:key4`);
    const result = await getRule(`${base}:key4`);
    expect(result).toBeNull();
  });
});
