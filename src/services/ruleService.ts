import { redis } from './redisClient';
import { AlgorithmName } from '../algorithms';

/** shape of a rate limit rule stored in redis */
export interface Rule {
  apiKey: string;
  algorithm: AlgorithmName;
  limit?: number;
  windowMs?: number;
  capacity?: number;
  refillRate?: number;
}

const ruleKey = (apiKey: string): string => `rl:rule:${apiKey}`;

/**
 * Store a rule in redis as a hash.
 * Numeric fields are serialized to strings (redis requirement).
 */
export async function createRule(rule: Rule): Promise<Rule> {
  const data: Record<string, string> = {
    apiKey: rule.apiKey,
    algorithm: rule.algorithm,
  };
  if (rule.limit !== undefined) data.limit = String(rule.limit);
  if (rule.windowMs !== undefined) data.windowMs = String(rule.windowMs);
  if (rule.capacity !== undefined) data.capacity = String(rule.capacity);
  if (rule.refillRate !== undefined) data.refillRate = String(rule.refillRate);

  await redis.hset(ruleKey(rule.apiKey), data);
  return rule;
}

/**
 * Retrieve a rule from redis, deserializing numeric fields back to numbers.
 * Returns null if the key does not exist.
 */
export async function getRule(apiKey: string): Promise<Rule | null> {
  const data = await redis.hgetall(ruleKey(apiKey));
  if (!data || Object.keys(data).length === 0) return null;
  return deserializeRule(data);
}

/**
 * Merge a partial update into an existing rule.
 * Returns null if the rule does not exist.
 */
export async function updateRule(
  apiKey: string,
  patch: Partial<Omit<Rule, 'apiKey'>>,
): Promise<Rule | null> {
  const existing = await getRule(apiKey);
  if (!existing) return null;
  const updated: Rule = { ...existing, ...patch };
  await createRule(updated);
  return updated;
}

/**
 * Remove a rule from redis entirely.
 */
export async function deleteRule(apiKey: string): Promise<void> {
  await redis.del(ruleKey(apiKey));
}

function deserializeRule(data: Record<string, string>): Rule {
  const rule: Rule = {
    apiKey: data.apiKey,
    algorithm: data.algorithm as AlgorithmName,
  };
  if (data.limit !== undefined) rule.limit = Number(data.limit);
  if (data.windowMs !== undefined) rule.windowMs = Number(data.windowMs);
  if (data.capacity !== undefined) rule.capacity = Number(data.capacity);
  if (data.refillRate !== undefined) rule.refillRate = Number(data.refillRate);
  return rule;
}
