import { z } from 'zod';

/** shared field present in every rule */
const apiKey = z.string().min(1, 'apiKey is required');

const fixedWindowSchema = z.object({
  algorithm: z.literal('fixed_window'),
  apiKey,
  limit: z.number().int().positive('limit must be a positive integer'),
  windowMs: z.number().int().positive('windowMs must be a positive integer'),
});

const slidingWindowSchema = z.object({
  algorithm: z.literal('sliding_window'),
  apiKey,
  limit: z.number().int().positive('limit must be a positive integer'),
  windowMs: z.number().int().positive('windowMs must be a positive integer'),
});

const tokenBucketSchema = z.object({
  algorithm: z.literal('token_bucket'),
  apiKey,
  capacity: z.number().int().min(1, 'capacity must be >= 1'),
  refillRate: z.number().positive('refillRate must be > 0'),
});

/**
 * Full rule creation schema — discriminated on `algorithm`.
 * Covers fixed_window, sliding_window, and token_bucket.
 */
export const ruleSchema = z.discriminatedUnion('algorithm', [
  fixedWindowSchema,
  slidingWindowSchema,
  tokenBucketSchema,
]);

export type RuleInput = z.infer<typeof ruleSchema>;

/**
 * Partial rule update schema — all fields optional except constraints still apply.
 * Used for PUT /rules/:key where callers may patch a subset of fields.
 */
export const partialRuleSchema = z.object({
  limit: z.number().int().positive('limit must be a positive integer').optional(),
  windowMs: z.number().int().positive('windowMs must be a positive integer').optional(),
  capacity: z.number().int().min(1, 'capacity must be >= 1').optional(),
  refillRate: z.number().positive('refillRate must be > 0').optional(),
});

export type PartialRuleInput = z.infer<typeof partialRuleSchema>;
