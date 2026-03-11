import { ruleSchema, partialRuleSchema } from '../../src/validators/ruleSchema';

describe('ruleSchema — fixed_window', () => {
  const base = { algorithm: 'fixed_window', apiKey: 'key-1', limit: 100, windowMs: 60000 };

  it('accepts a valid payload', () => {
    const result = ruleSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('rejects missing limit', () => {
    const { limit: _, ...rest } = base;
    const result = ruleSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing windowMs', () => {
    const { windowMs: _, ...rest } = base;
    const result = ruleSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects limit <= 0', () => {
    const result = ruleSchema.safeParse({ ...base, limit: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects windowMs <= 0', () => {
    const result = ruleSchema.safeParse({ ...base, windowMs: -1 });
    expect(result.success).toBe(false);
  });
});

describe('ruleSchema — sliding_window', () => {
  const base = { algorithm: 'sliding_window', apiKey: 'key-2', limit: 50, windowMs: 30000 };

  it('accepts a valid payload', () => {
    expect(ruleSchema.safeParse(base).success).toBe(true);
  });

  it('rejects limit <= 0', () => {
    expect(ruleSchema.safeParse({ ...base, limit: 0 }).success).toBe(false);
  });

  it('rejects windowMs <= 0', () => {
    expect(ruleSchema.safeParse({ ...base, windowMs: 0 }).success).toBe(false);
  });
});

describe('ruleSchema — token_bucket', () => {
  const base = { algorithm: 'token_bucket', apiKey: 'key-3', capacity: 10, refillRate: 1 };

  it('accepts a valid payload', () => {
    expect(ruleSchema.safeParse(base).success).toBe(true);
  });

  it('rejects missing capacity', () => {
    const { capacity: _, ...rest } = base;
    expect(ruleSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects missing refillRate', () => {
    const { refillRate: _, ...rest } = base;
    expect(ruleSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects capacity < 1', () => {
    expect(ruleSchema.safeParse({ ...base, capacity: 0 }).success).toBe(false);
  });

  it('rejects refillRate <= 0', () => {
    expect(ruleSchema.safeParse({ ...base, refillRate: 0 }).success).toBe(false);
  });
});

describe('ruleSchema — unknown algorithm', () => {
  it('rejects unknown algorithm', () => {
    const result = ruleSchema.safeParse({
      algorithm: 'leaky_bucket',
      apiKey: 'key-4',
      limit: 10,
      windowMs: 1000,
    });
    expect(result.success).toBe(false);
  });
});

describe('partialRuleSchema — update payloads', () => {
  it('accepts only limit field for fixed_window', () => {
    expect(partialRuleSchema.safeParse({ limit: 200 }).success).toBe(true);
  });

  it('accepts empty object (no-op update)', () => {
    expect(partialRuleSchema.safeParse({}).success).toBe(true);
  });

  it('rejects limit <= 0', () => {
    expect(partialRuleSchema.safeParse({ limit: 0 }).success).toBe(false);
  });
});
