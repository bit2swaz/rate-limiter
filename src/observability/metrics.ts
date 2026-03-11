import client from 'prom-client';

// collect default Node.js runtime metrics (cpu, memory, event loop lag, gc)
client.collectDefaultMetrics();

/** total requests processed by the rate limiter middleware */
export const requestsTotal = new client.Counter({
  name: 'ratelimiter_requests_total',
  help: 'total requests processed by the rate limiter middleware',
  labelNames: ['api_key', 'algorithm'] as const,
});

/** total requests rejected with 429 */
export const rejectionsTotal = new client.Counter({
  name: 'ratelimiter_rejections_total',
  help: 'total requests rejected with 429 by the rate limiter middleware',
  labelNames: ['api_key', 'algorithm'] as const,
});

/** latency of the rate limit algorithm check (seconds) */
export const middlewareLatency = new client.Histogram({
  name: 'ratelimiter_middleware_duration_seconds',
  help: 'rate limit algorithm check latency in seconds',
  labelNames: ['algorithm'] as const,
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1],
});

export const register = client.register;
