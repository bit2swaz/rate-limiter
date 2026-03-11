import type Redis from 'ioredis';
import { fixedWindow } from './fixedWindow';
import { tokenBucket } from './tokenBucket';
import { slidingWindow } from './slidingWindow';

export type AlgorithmName = 'token_bucket' | 'sliding_window' | 'fixed_window';

/**
 * Unified result returned by every rate-limiting algorithm.
 * `allowed` — 1 if the request is permitted, 0 if rejected.
 * `remaining` — how many more requests are allowed in the current window/bucket.
 */
export interface AlgorithmResult {
  allowed: 0 | 1;
  remaining: number;
}

export interface RuleContext {
  algorithm: AlgorithmName;
  limit?: number;
  windowMs?: number;
  capacity?: number;
  refillRate?: number;
}

export type AlgorithmFn = (
  redis: Redis,
  key: string,
  ctx: RuleContext,
  now: number,
) => Promise<AlgorithmResult>;

/**
 * thrown by {@link getAlgorithmFn} when an unrecognised algorithm name is
 * provided. extends Error so it is caught by the middleware try/catch and
 * results in a 500 response rather than an unhandled rejection.
 */
export class UnknownAlgorithmError extends Error {
  constructor(name: string) {
    super(`unknown algorithm: ${name}`);
    this.name = 'UnknownAlgorithmError';
  }
}

const tokenBucketFn: AlgorithmFn = (redis, key, ctx, now) =>
  tokenBucket(redis, key, ctx.capacity ?? 0, ctx.refillRate ?? 0, now);

const slidingWindowFn: AlgorithmFn = (redis, key, ctx, now) =>
  slidingWindow(redis, key, ctx.windowMs ?? 0, ctx.limit ?? 0, now);

const fixedWindowFn: AlgorithmFn = (redis, key, ctx) =>
  fixedWindow(redis, key, ctx.limit ?? 0, ctx.windowMs ?? 0);

/**
 * strategy factory — maps an algorithm name to its corresponding
 * {@link AlgorithmFn}. all returned functions share the same
 * `(redis, key, ctx, now) => Promise<AlgorithmResult>` signature so the
 * middleware can call them uniformly without knowing the concrete type.
 *
 * @param name - one of the supported algorithm names
 * @throws {UnknownAlgorithmError} if `name` is not a recognised algorithm
 *
 * @example
 * const fn = getAlgorithmFn('token_bucket');
 * const result = await fn(redis, `rl:${apiKey}`, rule, Date.now());
 */
export function getAlgorithmFn(name: AlgorithmName): AlgorithmFn {
  switch (name) {
    case 'token_bucket':
      return tokenBucketFn;
    case 'sliding_window':
      return slidingWindowFn;
    case 'fixed_window':
      return fixedWindowFn;
    default: {
      const _exhaustive: never = name;
      throw new UnknownAlgorithmError(_exhaustive as string);
    }
  }
}
