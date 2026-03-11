# Rate Limiter as a Service — Project Roadmap

> **SSOT Reference:** [SSOT.md](./SSOT.md)
> **Methodology:** Test-Driven Development (TDD) — Red → Green → Refactor at every phase.
> **Date Started:** 2026-03-11

---

## Guiding Principles

- **TDD First:** Every non-trivial module starts with a failing test. Code is written only to make the test pass, then refactored.
- **Vertical Slices:** Each mini-phase delivers a working, testable slice of functionality — no "dead" code exists for long.
- **Atomic Commits:** Each mini-phase maps to one or more focused commits. Branch per phase, PR to `main`.
- **Definition of Done (DoD):** A mini-phase is complete only when: code is written, tests pass, linter is clean, and the feature is manually verified.

---

## Phase Overview

| # | Phase | Focus | TDD? |
|---|---|---|---|
| 0 | Foundation & Scaffolding | Project skeleton, tooling, CI | Config-only |
| 1 | Redis Infrastructure | ioredis client, Lua loader, test harness | ✅ |
| 2 | Rate Limiting Algorithms | Fixed Window, Token Bucket, Sliding Window | ✅ TDD-strict |
| 3 | Core API Layer | Express, JWT auth, Keys & Rules routes | ✅ |
| 4 | Rate Limit Middleware | Middleware pipeline, strategy dispatch, headers | ✅ |
| 5 | Observability | Prometheus metrics, `/metrics` endpoint | ✅ |
| 6 | Containerization | Dockerfile, Docker Compose, Prometheus config | Smoke tests |
| 7 | Integration & E2E Testing | Full-stack API tests, race condition tests | ✅ |
| 8 | Documentation | README, OpenAPI, JSDoc, diagrams | — |
| 9 | Polish & Hardening | Validation, security, graceful shutdown, final QA | ✅ |

---

## Phase 0 — Foundation & Scaffolding

> **Goal:** A clean, runnable TypeScript project with all tooling wired up and CI ready. No business logic yet.

### 0.1 — Repository Initialization
- [ ] `git init`, create `.gitignore` (node_modules, dist, .env, *.log)
- [ ] `npm init -y`, set `"type": "module"` consideration (stick to CommonJS for ioredis compat)
- [ ] Install core runtime deps: `express`, `ioredis`, `jsonwebtoken`, `prom-client`, `dotenv`
- [ ] Install dev deps: `typescript`, `ts-node`, `tsx`, `@types/*`, `jest`, `ts-jest`, `supertest`, `@types/supertest`
- [ ] Create `package.json` scripts: `build`, `start`, `dev`, `test`, `lint`

### 0.2 — TypeScript & Linting Configuration
- [ ] Create `tsconfig.json`: `target: ES2022`, `module: CommonJS`, `strict: true`, `outDir: dist`, `rootDir: src`
- [ ] Install and configure `eslint` with `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin`
- [ ] Install and configure `prettier`, add `.prettierrc`
- [ ] Add `.eslintrc.json` with recommended + prettier rules
- [ ] Verify: `npm run lint` exits 0 on empty `src/`

### 0.3 — Project Directory Skeleton
- [ ] Create all directories from SSOT: `src/algorithms/`, `src/middleware/`, `src/routes/`, `src/services/`, `src/auth/`, `src/observability/`, `scripts/lua/`, `docker/`, `tests/`
- [ ] Create stub `index.ts` (empty Express app, listens on `PORT`)
- [ ] Create `.env.example` from SSOT env vars
- [ ] Create `.env` (gitignored) for local dev

### 0.4 — Test Harness Bootstrap
- [ ] Configure `jest.config.ts`: `preset: ts-jest`, `testEnvironment: node`, `testMatch: tests/**/*.test.ts`
- [ ] Configure `ts-jest` `globals` to use `tsconfig.json`
- [ ] Write a single trivial test (`1 + 1 === 2`) to confirm Jest is wired correctly
- [ ] Verify: `npm test` runs and passes

### 0.5 — CI Pipeline (GitHub Actions)
- [ ] Create `.github/workflows/ci.yml`
- [ ] Jobs: `lint` → `test` (sequentially, fail-fast)
- [ ] Use `redis` service container in GH Actions for integration tests
- [ ] Cache `node_modules` between runs
- [ ] Add CI badge to README stub

**Phase 0 Exit Criteria:**
- `npm run build` produces a `dist/` with compiled JS
- `npm test` runs the trivial test suite and passes
- `npm run lint` exits clean
- `docker compose up redis` starts a healthy Redis instance for local dev

---

## Phase 1 — Redis Infrastructure

> **Goal:** A fully tested, singleton ioredis client with a Lua script loading system. Everything that touches Redis goes through this layer.

### 1.1 — ioredis Singleton
- [ ] **RED:** Write `tests/redisClient.test.ts` — assert `redisClient` connects, `ping()` returns `"PONG"`, and the same instance is returned on repeated imports
- [ ] **GREEN:** Implement `src/services/redisClient.ts`
  - ioredis singleton using module-level variable
  - Connect using `REDIS_URL` env var
  - Emit a `ready` log on connection
  - Export typed `redis` instance
- [ ] **REFACTOR:** Add `disconnect()` helper for test teardown; handle connection error with process exit + log
- [ ] Verify: test passes, `redis-cli ping` confirms connectivity

### 1.2 — Lua Script Loader
- [ ] **RED:** Write tests asserting that `evalTokenBucket` and `evalSlidingWindow` methods exist on the redis client and return `0 | 1`
- [ ] **GREEN:** Add Lua script loading to `redisClient.ts`
  - Read `.lua` files from `scripts/lua/` at startup using `fs.readFileSync`
  - Use `redis.defineCommand()` (ioredis) to attach `evalTokenBucket` and `evalSlidingWindow` as typed commands
  - Export extended client with proper TypeScript types (`RedisClient` interface)
- [ ] **REFACTOR:** Extract a `loadLuaScripts(redis)` helper function; handle `ENOENT` gracefully

### 1.3 — Lua Script Files (Stubs)
- [ ] Create `scripts/lua/token_bucket.lua` (from SSOT — full implementation)
- [ ] Create `scripts/lua/sliding_window.lua` (from SSOT — full implementation)
- [ ] Manual verification: run scripts with `redis-cli EVAL` to confirm they return `1` (allowed) and `0` (rejected) correctly

**Phase 1 Exit Criteria:**
- `redisClient.test.ts` passes (ping, singleton, script commands exist)
- Lua scripts loaded without errors on startup
- Redis connection failure causes a clear, logged process exit

---

## Phase 2 — Rate Limiting Algorithms

> **Goal:** All three algorithms implemented via TDD, fully isolated and unit-tested against a real Redis instance. The Strategy Pattern abstraction is established here.

### 2.1 — Fixed Window Counter
- [ ] **RED:** Write `tests/fixedWindow.test.ts`
  - Assert: requests within limit are allowed (returns `1`)
  - Assert: request exceeding limit is rejected (returns `0`)
  - Assert: counter resets after window expires (use `redis.pexpire` manipulation)
  - Assert: concurrent requests don't exceed limit (run 10 parallel requests against limit of 5)
- [ ] **GREEN:** Implement `src/algorithms/fixedWindow.ts`
  - Use `INCR` + `PEXPIRE` (set TTL only if key is new: `INCR` returns 1)
  - Returns `Promise<0 | 1>`
  - Signature: `fixedWindow(redis, key, limit, windowMs, now): Promise<0 | 1>`
- [ ] **REFACTOR:** Extract key-building logic; add JSDoc

### 2.2 — Token Bucket Algorithm
- [ ] **RED:** Write `tests/tokenBucket.test.ts`
  - Assert: fresh bucket allows requests up to capacity
  - Assert: bucket depletes and rejects when empty
  - Assert: tokens refill over time (mock `now` to simulate elapsed time)
  - Assert: partial refill works correctly (elapsed < 1 second worth of tokens)
  - Assert: capacity is never exceeded (overfill protection)
  - Assert: no race condition — run 20 concurrent requests against capacity of 10, exactly 10 should be allowed
- [ ] **GREEN:** Implement `src/algorithms/tokenBucket.ts`
  - Call `redis.evalTokenBucket(key, 1, capacity, refillRate, now)` (1 key)
  - Parse and return result as `0 | 1`
  - Signature: `tokenBucket(redis, key, capacity, refillRate, now): Promise<0 | 1>`
- [ ] **REFACTOR:** Harden TypeScript types; verify Lua script handles `nil` initial state

### 2.3 — Sliding Window Log
- [ ] **RED:** Write `tests/slidingWindow.test.ts`
  - Assert: requests within window and limit are allowed
  - Assert: old entries outside the window are pruned correctly (entries older than `windowMs` don't count)
  - Assert: exactly at the limit is rejected
  - Assert: after old entries expire, new requests succeed
  - Assert: concurrent requests don't exceed limit (20 parallel against limit 10)
- [ ] **GREEN:** Implement `src/algorithms/slidingWindow.ts`
  - Call `redis.evalSlidingWindow(key, 1, windowMs, limit, now)`
  - Signature: `slidingWindow(redis, key, windowMs, limit, now): Promise<0 | 1>`
- [ ] **REFACTOR:** Ensure the Lua `math.random()` suffix on ZADD score prevents duplicate member collisions

### 2.4 — Algorithm Strategy Abstraction
- [ ] **RED:** Write `tests/algorithmFactory.test.ts`
  - Assert: `getAlgorithmFn('token_bucket')` returns the token bucket function
  - Assert: `getAlgorithmFn('sliding_window')` returns the sliding window function
  - Assert: `getAlgorithmFn('fixed_window')` returns the fixed window function
  - Assert: unknown algorithm throws `UnknownAlgorithmError`
- [ ] **GREEN:** Create `src/algorithms/index.ts`
  - Export `AlgorithmName` union type: `'token_bucket' | 'sliding_window' | 'fixed_window'`
  - Export `RuleContext` interface (rule params passed to algorithm)
  - Export `getAlgorithmFn(name: AlgorithmName)` factory
  - Define `AlgorithmFn` type signature
- [ ] **REFACTOR:** Ensure all algorithm functions share the same callable signature via the `AlgorithmFn` type

**Phase 2 Exit Criteria:**
- All algorithm tests pass (unit + concurrency)
- Race condition tests confirm atomic Lua scripts prevent over-counting
- `npm test` green, no linter errors

---

## Phase 3 — Core API Layer

> **Goal:** A fully functional Express app with JWT authentication, API key issuance, and rule CRUD — all tested with Supertest.

### 3.1 — Express App Bootstrap
- [ ] **RED:** Write `tests/app.test.ts` — assert `GET /health` returns `200 { status: 'ok' }`
- [ ] **GREEN:** Build `src/index.ts`
  - `express()` app with `express.json()` middleware
  - `GET /health` route
  - Listen on `process.env.PORT` (default 3000)
  - Export `app` for testing (do not call `listen` when `NODE_ENV=test`)
- [ ] **REFACTOR:** Separate `app.ts` (Express config, routes) from `index.ts` (server listen); this is critical for Supertest

### 3.2 — JWT Auth Middleware
- [ ] **RED:** Write `tests/auth.test.ts`
  - Assert: missing `Authorization` header → `401`
  - Assert: malformed/expired token → `401`
  - Assert: valid token passes through (`next()` called)
  - Assert: `POST /auth/token` with valid admin credentials returns a signed JWT
- [ ] **GREEN:** Implement `src/auth/jwtMiddleware.ts`
  - Verify `Bearer <token>` from `Authorization` header
  - Use `jsonwebtoken.verify()` with `JWT_SECRET` env var
  - Attach decoded payload to `req.user`
  - Implement `POST /auth/token` route (hardcoded admin credentials via env vars for MVP)
- [ ] **REFACTOR:** Extract `signToken()` and `verifyToken()` helpers; add proper TypeScript `Request` augmentation for `req.user`

### 3.3 — Rule Service (Business Logic)
- [ ] **RED:** Write `tests/ruleService.test.ts`
  - Assert: `createRule(rule)` stores rule in Redis hash `rl:rule:{apiKey}`
  - Assert: `getRule(apiKey)` retrieves and deserializes rule correctly
  - Assert: `updateRule(apiKey, patch)` merges partial updates
  - Assert: `deleteRule(apiKey)` removes the key
  - Assert: `getRule` on non-existent key returns `null`
- [ ] **GREEN:** Implement `src/services/ruleService.ts`
  - `createRule`, `getRule`, `updateRule`, `deleteRule` using `redis.hgetall` / `redis.hset` / `redis.del`
  - Serialize/deserialize numbers correctly (Redis stores everything as strings)
  - Export `Rule` TypeScript interface (from SSOT schema)
- [ ] **REFACTOR:** Add `validateRule()` utility (check required fields per algorithm); extract Redis key builder

### 3.4 — API Keys Route
- [ ] **RED:** Write `tests/keys.test.ts` (Supertest)
  - Assert: `POST /keys` without JWT → `401`
  - Assert: `POST /keys` with JWT → `201` with `{ apiKey: "usr_..." }`
  - Assert: generated key matches format `usr_[nanoid]`
  - Assert: key is stored in Redis set `rl:keys`
- [ ] **GREEN:** Implement `src/routes/keys.ts`
  - Apply `jwtMiddleware`
  - Generate key with `nanoid` (install dep)
  - Store in Redis
  - Return `201` with key
- [ ] **REFACTOR:** Move key generation to a `keyService.ts`; add `listKeys` endpoint

### 3.5 — Rules Route (CRUD)
- [ ] **RED:** Write `tests/rules.test.ts` (Supertest)
  - Assert: `POST /rules` without JWT → `401`
  - Assert: `POST /rules` with JWT + valid body → `201` with created rule
  - Assert: `POST /rules` with missing required fields → `400`
  - Assert: `GET /rules/:key` returns rule → `200`
  - Assert: `GET /rules/:key` for unknown key → `404`
  - Assert: `PUT /rules/:key` updates rule → `200`
  - Assert: `DELETE /rules/:key` → `204`
- [ ] **GREEN:** Implement `src/routes/rules.ts`
  - Mount all four handlers, all protected by `jwtMiddleware`
  - Delegate to `ruleService`
  - Return appropriate HTTP status codes
- [ ] **REFACTOR:** Add request body type guards; consistent error response shape `{ error: string }`

**Phase 3 Exit Criteria:**
- All route tests pass with Supertest
- JWT auth works end-to-end
- Rules CRUD fully functional and persisted in Redis

---

## Phase 4 — Rate Limit Middleware

> **Goal:** The core value proposition — per-key rate limiting middleware that dispatches to the correct algorithm, sets headers, and returns `429` when exceeded.

### 4.1 — Middleware Core Logic
- [ ] **RED:** Write `tests/rateLimitMiddleware.test.ts` (Supertest)
  - Setup: create a rule via `ruleService` directly, then hit a test endpoint
  - Assert: missing `x-api-key` header → `401`
  - Assert: unknown `x-api-key` → `401`
  - Assert: valid key within limit → request passes through (`200`)
  - Assert: valid key exceeding limit → `429 { error: "Rate limit exceeded" }`
  - Assert: works correctly for `token_bucket` algorithm
  - Assert: works correctly for `sliding_window` algorithm
  - Assert: works correctly for `fixed_window` algorithm
- [ ] **GREEN:** Implement `src/middleware/rateLimitMiddleware.ts` (from SSOT)
  - Read `x-api-key` header
  - Fetch rule via `getRule()`
  - Dispatch to correct algorithm via `getAlgorithmFn()`
  - Return `429` with `Retry-After` header on rejection
  - Call `next()` on allow
- [ ] **REFACTOR:** Extract key builder `buildRateLimitKey(apiKey)`; handle Redis errors gracefully (fail-open or fail-closed via env config)

### 4.2 — Rate Limit Response Headers
- [ ] **RED:** Write tests asserting response headers are set correctly
  - Assert: `X-RateLimit-Limit` header is set on allowed requests
  - Assert: `X-RateLimit-Remaining` header is set (requires algorithm to return remaining count)
  - Assert: `Retry-After` header is set on `429` responses
- [ ] **GREEN:** Update algorithms to return `{ allowed: 0|1, remaining: number }` struct
  - Update Lua scripts to return remaining tokens/count
  - Update `rateLimitMiddleware` to set all three headers
- [ ] **REFACTOR:** Define `AlgorithmResult` interface; update all algorithm signatures

### 4.3 — Proxy / Protected Route
- [ ] **RED:** Write tests for `ANY /proxy/*`
  - Assert: `GET /proxy/anything` without API key → `401`
  - Assert: `GET /proxy/anything` with valid key and available quota → `200`
  - Assert: after exhausting quota, `GET /proxy/anything` → `429`
- [ ] **GREEN:** Mount `rateLimitMiddleware` on `router.use('/proxy', rateLimitMiddleware, proxyHandler)`
  - `proxyHandler` for MVP: simple `200 { message: 'ok' }` echo (no real proxying)
- [ ] **REFACTOR:** Document that real proxying (http-proxy-middleware) is a future enhancement

**Phase 4 Exit Criteria:**
- Rate limiting works for all three algorithms end-to-end
- Correct HTTP headers on every response
- `429` responses include `Retry-After`
- All middleware tests pass

---

## Phase 5 — Observability

> **Goal:** Prometheus metrics instrumented throughout the middleware pipeline, exposed on `/metrics`.

### 5.1 — prom-client Setup
- [ ] **RED:** Write `tests/metrics.test.ts`
  - Assert: `GET /metrics` returns `200` with `Content-Type: text/plain; version=0.0.4`
  - Assert: response body contains `process_cpu_seconds_total` (default metrics)
- [ ] **GREEN:** Implement `src/observability/metrics.ts` (from SSOT)
  - `client.collectDefaultMetrics()`
  - Export `requestsTotal` Counter, `rejectionsTotal` Counter, `middlewareLatency` Histogram
- [ ] Implement `src/routes/metrics.ts` — expose `/metrics` using `client.register.metrics()`
- [ ] **REFACTOR:** Ensure `register` is a singleton; reset registry between tests with `client.register.clear()`

### 5.2 — Instrumentation in Middleware
- [ ] **RED:** Write tests asserting metric counters increment correctly
  - Assert: after one allowed request, `ratelimiter_requests_total` counter incremented
  - Assert: after one rejected request, `ratelimiter_rejections_total` counter incremented
  - Assert: labels `api_key` and `algorithm` are present on the metrics
- [ ] **GREEN:** Update `rateLimitMiddleware.ts`
  - `requestsTotal.inc({ api_key, algorithm })` on every request
  - `rejectionsTotal.inc({ api_key, algorithm })` on `429`
  - Wrap the algorithm call with `middlewareLatency.startTimer()` / `end()`
- [ ] **REFACTOR:** Confirm labels don't accidentally expose PII; add option to hash API key labels

### 5.3 — Histogram Verification
- [ ] **RED:** Assert histogram buckets appear in `/metrics` output after requests
- [ ] **GREEN:** Verified automatically by the Supertest tests hitting the proxy endpoint
- [ ] **REFACTOR:** Tune histogram buckets to match Redis latency expectations (`[0.001, 0.005, 0.01, 0.05, 0.1]`)

**Phase 5 Exit Criteria:**
- `/metrics` returns valid Prometheus exposition format
- Counters and histogram update correctly after traffic
- All observability tests pass

---

## Phase 6 — Containerization

> **Goal:** The entire stack (app + Redis + Prometheus) runs with `docker compose up`. Multi-stage Dockerfile produces a lean production image.

### 6.1 — Dockerfile (Multi-Stage)
- [ ] Write `docker/Dockerfile` (from SSOT)
  - `builder` stage: `node:20-alpine`, install all deps, copy source, `npm run build`
  - `runner` stage: `node:20-alpine`, `NODE_ENV=production`, copy `dist/` and `scripts/`, install prod deps only
  - `EXPOSE 3000`, `CMD ["node", "dist/index.js"]`
- [ ] Build and verify: `docker build -f docker/Dockerfile -t rate-limiter .`
- [ ] Smoke test: `docker run --env-file .env rate-limiter` — confirm it starts (Redis connection will fail without compose, that's ok)

### 6.2 — Docker Compose
- [ ] Write `docker/docker-compose.yml` (from SSOT)
  - `app` service with Redis healthcheck dependency
  - `redis:7-alpine` with `redis_data` volume and healthcheck
  - `prometheus` service with config volume mount
- [ ] Create `docker/prometheus.yml`
  - Scrape config targeting `app:3000/metrics` every 15s
- [ ] Full stack smoke test: `docker compose up --build`
  - Verify `curl localhost:3000/health` → `200`
  - Verify `curl localhost:9090` → Prometheus UI
  - Verify Redis data persistence across container restarts

### 6.3 — Environment & Secrets
- [ ] Confirm `.env.example` covers all required vars
- [ ] Document in README how to generate `JWT_SECRET` (`openssl rand -hex 32`)
- [ ] Ensure `docker-compose.yml` reads `JWT_SECRET` from host env / `.env` file
- [ ] Add Docker Compose override `docker-compose.override.yml` for local dev (bind-mount `src/` for hot reload with `tsx watch`)

**Phase 6 Exit Criteria:**
- `docker compose up --build` brings entire stack up cleanly
- App, Redis, and Prometheus are all healthy
- `docker compose down -v` tears everything down cleanly

---

## Phase 7 — Integration & E2E Testing

> **Goal:** Full-stack integration tests that exercise the entire system from HTTP request to Redis and back. Catch race conditions and edge cases that unit tests miss.

### 7.1 — Full API Integration Tests
- [ ] Write `tests/integration/fullFlow.test.ts`
  - Full happy path: `POST /auth/token` → `POST /keys` → `POST /rules` → hit `/proxy/*` N times → verify `429` on N+1
  - Test with `token_bucket` rule
  - Test with `sliding_window` rule
  - Test with `fixed_window` rule
  - Test rule update: increase limit mid-session, confirm previously-rejected requests now pass
  - Test rule deletion: deleted rule → `401`
- [ ] Write `tests/integration/headers.test.ts`
  - Verify `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` headers at each request in a sequence

### 7.2 — Concurrency / Race Condition Tests
- [ ] Write `tests/integration/concurrency.test.ts`
  - Fire 50 concurrent requests against a limit of 10
  - Assert: exactly 10 are allowed, 40 are rejected (±0 tolerance, not ±N)
  - Run for all three algorithms
  - This test is the proof that Lua atomicity works correctly
- [ ] Document expected behavior in test comments

### 7.3 — Edge Cases
- [ ] Write `tests/integration/edgeCases.test.ts`
  - Redis disconnected mid-request: mock `redis.evalTokenBucket` to throw → assert app returns `500` or fail-open `200` (based on config)
  - Malformed rule stored in Redis (corrupt hash) → assert graceful `500`, not crash
  - Very large `windowMs` (e.g., 24 hours) → verify TTL is set correctly
  - `capacity: 0` in token bucket → every request rejected immediately

**Phase 7 Exit Criteria:**
- All integration tests pass against a live Redis instance
- Concurrency test passes with zero over-counting
- Edge case tests confirm graceful degradation

---

## Phase 8 — Documentation

> **Goal:** The project is fully documented for external developers, contributors, and future-you. Documentation is treated as a deliverable, not an afterthought.

### 8.1 — README.md
- [ ] Write `README.md` with:
  - Project title, one-line description, CI badge
  - Architecture diagram (copy ASCII from SSOT, render in Markdown)
  - **Quick Start** section: clone → install → `docker compose up` → first API call (with `curl` examples for all endpoints)
  - **API Reference** table (from SSOT, with example request/response bodies for each endpoint)
  - **Configuration** — all env vars, their defaults, and purpose
  - **Algorithms** — brief explanation of Token Bucket, Sliding Window, Fixed Window with trade-offs
  - **Running Tests** — `npm test`, `npm run test:integration`
  - **Project Structure** — annotated directory tree

### 8.2 — OpenAPI / Swagger Specification
- [ ] Write `docs/openapi.yaml` (OpenAPI 3.1)
  - Define all schemas: `Rule`, `ApiKey`, `JwtToken`, `ErrorResponse`
  - Document all endpoints with request/response bodies, status codes, and auth requirements
  - Include examples for each endpoint
- [ ] Install `swagger-ui-express` and serve Swagger UI at `GET /docs` (dev-only, gated by `NODE_ENV !== 'production'`)
- [ ] Write a test asserting `GET /docs` returns `200` in development

### 8.3 — JSDoc / TSDoc Comments
- [ ] Add JSDoc to all exported functions in:
  - `src/algorithms/*.ts` — document params, return values, and algorithm behavior
  - `src/services/ruleService.ts` — document each CRUD method
  - `src/middleware/rateLimitMiddleware.ts` — document the middleware contract
  - `src/observability/metrics.ts` — document each metric's purpose and labels
- [ ] Add `@example` blocks for complex functions
- [ ] Configure `typedoc` as a dev dep; generate HTML docs with `npm run docs`

### 8.4 — Architecture Decision Records (ADRs)
- [ ] Create `docs/adr/` directory
- [ ] Write ADR-001: Why Redis Lua scripts for atomicity (vs. transactions / WATCH)
- [ ] Write ADR-002: Why ioredis over `node-redis`
- [ ] Write ADR-003: Algorithm trade-off analysis (Fixed Window vs. Sliding Window vs. Token Bucket)
- [ ] Write ADR-004: Why JWT for admin auth (vs. API key for API key...)

### 8.5 — Contributing Guide
- [ ] Write `CONTRIBUTING.md`
  - Development setup (prerequisites: Node 20, Docker)
  - Running the test suite locally
  - Branching strategy and commit message format (Conventional Commits)
  - How to add a new algorithm (step-by-step)
  - How to run linting and fix auto-fixable issues

### 8.6 — CHANGELOG
- [ ] Create `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com) format
- [ ] Retroactively document v0.1.0 with all features shipped in Phases 1–7

**Phase 8 Exit Criteria:**
- `README.md` is complete — a new developer can clone and run the project in under 5 minutes
- `GET /docs` renders Swagger UI in development
- `npm run docs` generates TypeDoc HTML without errors
- All exported functions have JSDoc comments

---

## Phase 9 — Polish & Production Hardening

> **Goal:** Harden the service for production: input validation, security headers, graceful shutdown, and a final quality pass.

### 9.1 — Input Validation (Zod)
- [ ] Install `zod`
- [ ] **RED:** Write tests asserting `POST /rules` with invalid bodies returns `400` with a structured error listing all failing fields
- [ ] **GREEN:** Create `src/validators/ruleSchema.ts` — Zod schema for Rule payload
  - Validate `algorithm` is a known value
  - Validate `token_bucket` rules have `capacity` and `refillRate`
  - Validate `sliding_window` and `fixed_window` rules have `limit` and `windowMs`
  - Validate numeric ranges (e.g., `limit > 0`, `windowMs > 0`)
- [ ] Apply Zod validation middleware to `POST /rules` and `PUT /rules/:key`
- [ ] **REFACTOR:** Create a generic `validate(schema)` middleware factory

### 9.2 — Security Headers
- [ ] Install `helmet`
- [ ] **RED:** Write test asserting `X-Content-Type-Options: nosniff` and other helmet headers are present
- [ ] **GREEN:** Add `app.use(helmet())` in `app.ts`
- [ ] Ensure `/metrics` is not exposed publicly in production (add `METRICS_TOKEN` env var option)

### 9.3 — Rate Limit Admin Endpoints
- [ ] Apply `fixed_window` rate limiting to `POST /auth/token` (prevent brute force): 10 req/min per IP
- [ ] Write a test asserting the `POST /auth/token` endpoint returns `429` after 10 rapid requests

### 9.4 — Graceful Shutdown
- [ ] **RED:** Write test asserting in-flight requests complete before server closes
- [ ] **GREEN:** Handle `SIGTERM` and `SIGINT` in `index.ts`
  - Stop accepting new connections: `server.close()`
  - Disconnect Redis: `redis.disconnect()`
  - Exit with code `0` after cleanup
- [ ] Add a configurable `SHUTDOWN_TIMEOUT_MS` env var (default: 5000)

### 9.5 — Error Handling Middleware
- [ ] Implement a global Express error handler in `src/middleware/errorHandler.ts`
  - Catch all `next(err)` calls
  - Return `500 { error: 'Internal server error' }` (never leak stack traces in production)
  - Log full error with stack in development
- [ ] Write tests triggering `500` responses (mock a Redis failure)

### 9.6 — Final QA Pass
- [ ] Run `npm test` — all tests pass (unit + integration)
- [ ] Run `npm run lint` — zero errors, zero warnings
- [ ] Run `npm run build` — clean TypeScript compile, zero errors
- [ ] Manual smoke test with Docker Compose
  - Full happy path with `curl`
  - Verify Prometheus scrapes metrics
  - Verify `429` responses
- [ ] Review all `TODO` and `FIXME` comments, resolve or create issues
- [ ] Bump version to `1.0.0` in `package.json`
- [ ] Tag release `v1.0.0` in Git

**Phase 9 Exit Criteria:**
- All tests pass
- `docker compose up` — full stack healthy, all endpoints respond correctly
- Zero linter errors
- `v1.0.0` tagged

---

## Test File Map

| Test File | Phase | Type | Covers |
|---|---|---|---|
| `tests/unit/redisClient.test.ts` | 1 | Unit | Redis connection, Lua loader |
| `tests/unit/fixedWindow.test.ts` | 2 | Unit | Fixed window counter algorithm |
| `tests/unit/tokenBucket.test.ts` | 2 | Unit | Token bucket algorithm + Lua |
| `tests/unit/slidingWindow.test.ts` | 2 | Unit | Sliding window algorithm + Lua |
| `tests/unit/algorithmFactory.test.ts` | 2 | Unit | Strategy factory |
| `tests/unit/ruleService.test.ts` | 3 | Unit | Rule CRUD service |
| `tests/api/auth.test.ts` | 3 | API | JWT auth middleware |
| `tests/api/keys.test.ts` | 3 | API | `POST /keys` |
| `tests/api/rules.test.ts` | 3 | API | Rules CRUD endpoints |
| `tests/api/middleware.test.ts` | 4 | API | Rate limit middleware |
| `tests/api/metrics.test.ts` | 5 | API | Prometheus metrics endpoint |
| `tests/integration/fullFlow.test.ts` | 7 | Integration | End-to-end happy path |
| `tests/integration/headers.test.ts` | 7 | Integration | Response headers |
| `tests/integration/concurrency.test.ts` | 7 | Integration | Race condition / atomicity |
| `tests/integration/edgeCases.test.ts` | 7 | Integration | Failure modes |
| `tests/unit/validators.test.ts` | 9 | Unit | Zod schema validation |

---

## Dependency Map

```
Phase 0 (Tooling)
    └─► Phase 1 (Redis Client)
            └─► Phase 2 (Algorithms)
                    └─► Phase 3 (API Layer)
                            └─► Phase 4 (Middleware)
                                    ├─► Phase 5 (Observability)
                                    └─► Phase 6 (Containers)
                                            └─► Phase 7 (Integration Tests)
                                                    └─► Phase 8 (Documentation)
                                                            └─► Phase 9 (Hardening)
```

---

## Milestone Summary

| Milestone | Phases | Description |
|---|---|---|
| 🏗️ **M1 — Skeleton** | 0–1 | Repo scaffolded, Redis connected, Lua scripts loaded |
| ⚙️ **M2 — Algorithms** | 2 | All three algorithms unit-tested and race-condition-safe |
| 🔑 **M3 — API** | 3–4 | Full REST API + rate limiting middleware working |
| 📊 **M4 — Observable** | 5–6 | Prometheus metrics + full Docker stack running |
| ✅ **M5 — Tested** | 7 | Integration + concurrency tests all green |
| 📖 **M6 — Documented** | 8 | README, OpenAPI, JSDoc, ADRs complete |
| 🚀 **M7 — v1.0.0** | 9 | Production-hardened, tagged, shippable |

---

*This roadmap is a living document. Update task statuses and notes as each mini-phase is completed.*
