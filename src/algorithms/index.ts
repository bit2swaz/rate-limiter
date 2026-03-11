import type Redis from 'ioredis';
import { fixedWindow } from './fixedWindow';
import { tokenBucket } from './tokenBucket';
import { slidingWindow } from './slidingWindow';

export type AlgorithmName = 'token_bucket' | 'sliding_window' | 'fixed_window';

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
) => Promise<0 | 1>;

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
