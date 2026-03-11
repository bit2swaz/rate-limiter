# contributing to rate-limiter-as-a-service

thank you for your interest in contributing. this guide covers everything you
need to get a local development environment running, understand the codebase,
and submit high-quality changes.

---

## prerequisites

| tool | minimum version | install |
|------|-----------------|---------|
| node.js | 20 LTS | https://nodejs.org |
| npm | 9+ | bundled with node |
| redis | 7 | https://redis.io/docs/getting-started |
| docker (optional) | 24+ | https://docs.docker.com/get-docker |
| git | 2.30+ | https://git-scm.com |

---

## development setup

```bash
# 1. fork and clone
git clone https://github.com/<your-username>/rate-limiter.git
cd rate-limiter

# 2. install dependencies
npm install

# 3. copy env file and fill in values (defaults work for local dev)
cp .env.example .env

# 4. start redis (if not using docker)
redis-server --daemonize yes

# 5. start with hot reload
npm run dev

# 6. verify
curl http://localhost:3000/health
# {"status":"ok"}
```

### using docker instead

```bash
JWT_SECRET=$(openssl rand -hex 32) \
  docker compose -f docker/docker-compose.yml up --build
```

---

## running the test suite

redis must be running before running tests:

```bash
redis-cli ping || redis-server --daemonize yes
```

```bash
# run all tests
npm test

# run a single file
npx jest tests/integration/concurrency.test.ts

# run with coverage report
npm run test:coverage

# run in watch mode during development
npx jest --watch
```

### test structure

| directory | type | what it covers |
|-----------|------|----------------|
| `tests/unit/` | unit | algorithms, redis client, rule service, algorithm factory |
| `tests/api/` | api | all express routes via supertest |
| `tests/integration/` | integration | e2e flows, response headers, concurrency, edge cases |

all tests hit a real redis instance. each test file uses a unique key prefix
with `Date.now()` to avoid cross-test pollution.

---

## linting and formatting

```bash
# lint (must exit 0 before committing)
npm run lint

# auto-fix lint errors
npm run lint:fix

# format with prettier
npm run format
```

the eslint config is in `.eslintrc.json`. prettier config is in `.prettierrc`.
the most important rule: no `any` types without a comment explaining why.

---

## branching strategy

| branch | purpose |
|--------|---------|
| `main` | always releasable, protected |
| `feat/<name>` | new features |
| `fix/<name>` | bug fixes |
| `docs/<name>` | documentation changes |
| `chore/<name>` | maintenance (deps, config, ci) |

create a branch per change, open a pr to `main`. squash-merge to keep the
commit history clean.

---

## commit message format

this project uses [conventional commits](https://www.conventionalcommits.org).

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

**types:** `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `perf`

**examples:**

```
feat(algorithms): add leaky bucket algorithm
fix(middleware): handle undefined x-api-key header gracefully
docs(readme): add prometheus query examples
test(concurrency): increase timeout for sliding_window burst test
chore(deps): bump ioredis to 5.4.0
```

- subject line: lowercase, no period at the end, under 72 characters
- body: explain what and why (not how); wrap at 72 characters
- breaking changes: add `BREAKING CHANGE:` footer with description

---

## how to add a new algorithm

follow these steps to add, for example, a `leaky_bucket` algorithm:

### 1. write the lua script (if atomic operations are needed)

create `scripts/lua/leaky_bucket.lua`. see the existing scripts for the expected
`KEYS[1]` and `ARGV[*]` conventions. the script must return `{allowed, remaining}`
as a two-element array.

### 2. load the script in the redis client

open `src/services/redisClient.ts`. add a `defineCommand` call following the
same pattern as `evalTokenBucket` and `evalSlidingWindow`. extend the
`RedisClient` interface with the new method signature.

### 3. write the algorithm function

create `src/algorithms/leakyBucket.ts`. follow the same signature as
`tokenBucket.ts` or `slidingWindow.ts` — the function must accept `(redis, key, ...params)`
and return `Promise<AlgorithmResult>`.

### 4. register in the factory

open `src/algorithms/index.ts`:
- add `'leaky_bucket'` to the `AlgorithmName` union type
- add the required fields to `RuleContext`
- add a wrapping `AlgorithmFn` and a case in `getAlgorithmFn`

### 5. write unit tests

create `tests/unit/leakyBucket.test.ts`. use the existing test files as a
template. required test cases:
- requests within capacity are allowed
- requests exceeding capacity are rejected
- tokens drain and reject when exhausted
- concurrency test: n parallel requests, expect exactly capacity allowed

### 6. run tests

```bash
npm test
```

all tests must pass before submitting a pr.

---

## project structure (annotated)

```
src/
  algorithms/     - rate limiting algorithm implementations
  auth/           - jwt signing, verification, and middleware
  middleware/     - rateLimitMiddleware (the core value proposition)
  observability/  - prometheus counters and histogram
  routes/         - express route handlers
  services/       - redis client, rule crud
  app.ts          - express app (routes mounted, no listen call)
  index.ts        - server entry point (listen)

scripts/lua/      - atomic lua scripts for redis
tests/            - all tests (unit / api / integration)
docs/             - openapi spec, adrs, roadmap, ssot
```

---

## code style guidelines

- **all lowercase** in user-facing strings (error messages, log lines)
- **no `any`** unless unavoidable — add a comment explaining the exception
- **jsdoc on all exported functions** — `@param`, `@returns`, `@example`
- **no magic numbers** — extract named constants
- **tests use unique key prefixes** — always use `` `test:p<n>:<module>:${Date.now()}` ``
  as a base to avoid cross-test redis pollution

---

## getting help

open a github issue for bugs, feature requests, or questions. include:
- steps to reproduce
- expected vs actual behavior
- node.js, redis, and npm versions (`node -v`, `redis-cli --version`, `npm -v`)
