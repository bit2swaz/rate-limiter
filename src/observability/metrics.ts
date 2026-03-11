/**
 * @module metrics
 * prometheus instrumentation for the rate limiter middleware.
 *
 * metrics exposed:
 * - `ratelimiter_requests_total` — counter, labels: api_key, algorithm
 * - `ratelimiter_rejections_total` — counter, labels: api_key, algorithm
 * - `ratelimiter_middleware_duration_seconds` — histogram, label: algorithm
 * - default node.js process metrics (cpu, memory, event loop, gc)
 */
import client from 'prom-client';

// collect default Node.js runtime metrics (cpu, memory, event loop lag, gc)
client.collectDefaultMetrics();

/**
 * total requests processed by the rate limiter middleware.
 * incremented on every request regardless of allow/reject.
 * labels: `api_key`, `algorithm`
 */
export const requestsTotal = new client.Counter({
  name: 'ratelimiter_requests_total',
  help: 'total requests processed by the rate limiter middleware',
  labelNames: ['api_key', 'algorithm'] as const,
});

/**
 * total requests rejected with http 429.
 * incremented only when the algorithm returns `allowed: 0`.
 * labels: `api_key`, `algorithm`
 */
export const rejectionsTotal = new client.Counter({
  name: 'ratelimiter_rejections_total',
  help: 'total requests rejected with 429 by the rate limiter middleware',
  labelNames: ['api_key', 'algorithm'] as const,
});

/**
 * histogram of the time spent inside the rate limit algorithm check.
 * measures only the algorithm call, not the full middleware execution.
 * buckets are tuned to redis latency expectations: 1ms, 5ms, 10ms, 50ms, 100ms.
 * label: `algorithm`
 */
export const middlewareLatency = new client.Histogram({
  name: 'ratelimiter_middleware_duration_seconds',
  help: 'rate limit algorithm check latency in seconds',
  labelNames: ['algorithm'] as const,
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1],
});

export const register = client.register;
