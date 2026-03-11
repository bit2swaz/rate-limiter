# changelog

all notable changes to this project will be documented in this file.

the format is based on [keep a changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [semantic versioning](https://semver.org/spec/v2.0.0.html).

---

## [unreleased]

---

## [0.1.0] - 2026-03-11

initial release. production-grade redis-backed rate limiter as a service with
all three core algorithms, full rest api, prometheus observability, docker
deployment, and a comprehensive test suite.

### added

**phase 0 - scaffolding**
- initialized node.js/typescript project with strict tsconfig
- configured eslint with `@typescript-eslint` rules and prettier integration
- set up jest with ts-jest for testing
- created `.github/workflows/ci.yml` with lint and test jobs
- added `.env.example` with all required environment variables
- added multi-stage dockerfile and docker compose with redis and prometheus

**phase 1 - redis infrastructure**
- `src/services/redisClient.ts`: ioredis singleton with `REDIS_URL` env var,
  auto-reconnect, and graceful `disconnect()` helper
- lua script loader using ioredis `defineCommand`: attaches `evalTokenBucket`
  and `evalSlidingWindow` as typed methods on the redis client
- `scripts/lua/token_bucket.lua`: atomic token replenishment (read + calculate
  + write in one redis execution)
- `scripts/lua/sliding_window.lua`: atomic sorted set log with pruning

**phase 2 - rate limiting algorithms**
- `src/algorithms/fixedWindow.ts`: fixed window counter using `INCR` + `PEXPIRE`
- `src/algorithms/tokenBucket.ts`: token bucket delegating to lua script
- `src/algorithms/slidingWindow.ts`: sliding window log delegating to lua script
- `src/algorithms/index.ts`: strategy factory (`getAlgorithmFn`), `AlgorithmFn`
  type, `AlgorithmResult` interface, `UnknownAlgorithmError` class

**phase 3 - core api layer**
- `src/app.ts`: express v5 app with all routes mounted, `GET /health` endpoint
- `src/auth/jwtMiddleware.ts`: `signToken`, `verifyToken`, `jwtMiddleware`,
  `authRouter` with `POST /auth/token`
- `src/services/ruleService.ts`: `createRule`, `getRule`, `updateRule`,
  `deleteRule` backed by redis hashes; number deserialization from string fields
- `src/routes/keys.ts`: `POST /keys` — generates nanoid-based api keys stored
  in the `rl:keys` redis set
- `src/routes/rules.ts`: full crud (`POST`, `GET`, `PUT`, `DELETE /rules/:key`)
  with request body validation

**phase 4 - rate limit middleware**
- `src/middleware/rateLimitMiddleware.ts`: reads `x-api-key`, fetches rule,
  dispatches to algorithm, sets `x-ratelimit-limit`, `x-ratelimit-remaining`,
  `retry-after` headers, returns 429 on rejection, 500 on internal error
- `ANY /proxy/*` route protected by the rate limit middleware

**phase 5 - observability**
- `src/observability/metrics.ts`: `ratelimiter_requests_total` (counter),
  `ratelimiter_rejections_total` (counter), `ratelimiter_middleware_duration_seconds`
  (histogram), default node.js process metrics
- `src/routes/metrics.ts`: `GET /metrics` prometheus text exposition endpoint

**phase 6 - containerization**
- `docker/Dockerfile`: multi-stage build (builder: compile ts; runner: node alpine
  with prod deps only)
- `docker/docker-compose.yml`: app + redis 7 alpine (with healthcheck) +
  prometheus; redis data volume
- `docker/prometheus.yml`: scrape config targeting `app:3000/metrics` every 15s

**phase 7 - integration and e2e tests**
- `tests/integration/fullFlow.test.ts`: end-to-end happy path for all three
  algorithms, rule update, rule deletion
- `tests/integration/headers.test.ts`: `x-ratelimit-limit`, `x-ratelimit-remaining`
  decrement sequence, `retry-after` on 429 for all three algorithms
- `tests/integration/concurrency.test.ts`: 50 concurrent requests vs limit 10 for
  all three algorithms — asserts exactly 10 allowed (lua atomicity proof)
- `tests/integration/edgeCases.test.ts`: redis error mock returning 500, corrupt
  algorithm returning 500, `capacity: 0` returning immediate 429, large `windowMs`
  ttl verification

**phase 8 - documentation**
- `README.md`: project overview, architecture diagram, quick start, api reference,
  algorithm explanations, configuration table, running tests, project structure
- `docs/openapi.yaml`: openapi 3.1 specification with all schemas, endpoints,
  request/response examples, and auth requirements
- swagger ui served at `GET /docs` (development only, via swagger-ui-express)
- jsdoc added to all exported functions in algorithms, middleware, observability,
  and auth modules
- `typedoc.json` + `npm run docs` script to generate html api docs
- `docs/adr/ADR-001-lua-scripts-for-atomicity.md`
- `docs/adr/ADR-002-ioredis-over-node-redis.md`
- `docs/adr/ADR-003-algorithm-trade-offs.md`
- `docs/adr/ADR-004-jwt-for-admin-auth.md`
- `CONTRIBUTING.md`: dev setup, test guide, branching strategy, conventional
  commits, step-by-step guide for adding a new algorithm

### test coverage (v0.1.0)

- 119 tests across 17 test suites
- unit tests: redis client, all three algorithms, algorithm factory, rule service
- api tests: auth, keys, rules, middleware, metrics, swagger docs
- integration tests: full flow, headers, concurrency (50 parallel), edge cases

[unreleased]: https://github.com/bit2swaz/rate-limiter/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/bit2swaz/rate-limiter/releases/tag/v0.1.0
