# Rate Limiter as a Service (Node.js)

## Overview
A production-grade, Redis-backed HTTP rate limiting service exposing a REST API to configure rules per API key, with support for multiple algorithms, observability via Prometheus, and Docker-first deployment.

## Stack
| Layer | Tech |
|---|---|
| Runtime | Node.js 20 (LTS) |
| Framework | Express.js |
| Rate Limit Store | Redis 7 |
| Auth | JWT (API key issuance) |
| Observability | Prometheus + prom-client |
| Containerization | Docker + Docker Compose |
| Testing | Jest + Supertest |
| Language | TypeScript |

## Architecture

```
Client Request
      │
      ▼
┌─────────────┐
│  Express    │  ← REST API (configure rules, issue keys)
│  HTTP Layer │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  Rate Limit     │  ← Middleware pipeline
│  Middleware     │
└──────┬──────────┘
       │
  ┌────┴────┐
  │         │
  ▼         ▼
Token    Sliding
Bucket   Window     ← Algorithm strategies (Strategy Pattern)
  │         │
  └────┬────┘
       │
       ▼
┌─────────────┐
│    Redis    │  ← Atomic Lua scripts for thread-safe counters
└─────────────┘
       │
       ▼
┌─────────────┐
│ Prometheus  │  ← /metrics endpoint (requests, rejections, latency)
└─────────────┘
```

## Directory Structure

```
rate-limiter/
├── src/
│   ├── algorithms/
│   │   ├── tokenBucket.ts       # Token bucket implementation (Lua script)
│   │   ├── slidingWindow.ts     # Sliding window log (Lua script)
│   │   └── fixedWindow.ts       # Fixed window counter
│   ├── middleware/
│   │   └── rateLimitMiddleware.ts  # Express middleware, reads rule from Redis
│   ├── routes/
│   │   ├── keys.ts              # POST /keys - issue API keys
│   │   ├── rules.ts             # CRUD /rules - configure per-key limits
│   │   └── metrics.ts           # GET /metrics - Prometheus exposition
│   ├── services/
│   │   ├── redisClient.ts       # ioredis singleton + Lua script loader
│   │   └── ruleService.ts       # Rule CRUD business logic
│   ├── auth/
│   │   └── jwtMiddleware.ts     # Protect admin routes with JWT
│   ├── observability/
│   │   └── metrics.ts           # prom-client counters/histograms
│   └── index.ts                 # Express app bootstrap
├── scripts/
│   └── lua/
│       ├── token_bucket.lua     # Atomic token replenishment
│       └── sliding_window.lua   # Atomic sorted set log
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── tests/
│   ├── tokenBucket.test.ts
│   ├── slidingWindow.test.ts
│   └── api.test.ts
├── .env.example
└── README.md
```

## Core Implementation Details

### 1. Token Bucket (Lua Script — atomic, no race conditions)
```lua
-- scripts/lua/token_bucket.lua
-- KEYS[1] = rate limit key, ARGV[1] = capacity, ARGV[2] = refill_rate/sec, ARGV[3] = now (ms)
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(bucket[1]) or capacity
local last_refill = tonumber(bucket[2]) or now

-- Calculate tokens to add since last refill
local elapsed = (now - last_refill) / 1000
local new_tokens = math.min(capacity, tokens + elapsed * refill_rate)

if new_tokens >= 1 then
  redis.call('HMSET', key, 'tokens', new_tokens - 1, 'last_refill', now)
  redis.call('PEXPIRE', key, 60000)
  return 1  -- allowed
else
  return 0  -- rejected
end
```

### 2. Sliding Window (Lua Script)
```lua
-- scripts/lua/sliding_window.lua
-- KEYS[1] = key, ARGV[1] = window_ms, ARGV[2] = limit, ARGV[3] = now (ms)
local key = KEYS[1]
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cutoff = now - window

redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
local count = redis.call('ZCARD', key)

if count < limit then
  redis.call('ZADD', key, now, now .. math.random())
  redis.call('PEXPIRE', key, window)
  return 1
else
  return 0
end
```

### 3. Rate Limit Middleware
```typescript
// src/middleware/rateLimitMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import { redis } from '../services/redisClient';
import { getRule } from '../services/ruleService';
import { requestsTotal, rejectionsTotal } from '../observability/metrics';

export async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;
  if (!apiKey) return res.status(401).json({ error: 'Missing API key' });

  const rule = await getRule(apiKey);
  if (!rule) return res.status(401).json({ error: 'Unknown API key' });

  const key = `rl:${apiKey}`;
  const now = Date.now();
  let allowed: number;

  if (rule.algorithm === 'token_bucket') {
    allowed = await redis.evalTokenBucket(key, rule.capacity, rule.refillRate, now);
  } else {
    allowed = await redis.evalSlidingWindow(key, rule.windowMs, rule.limit, now);
  }

  requestsTotal.inc({ api_key: apiKey, algorithm: rule.algorithm });

  if (!allowed) {
    rejectionsTotal.inc({ api_key: apiKey, algorithm: rule.algorithm });
    res.setHeader('Retry-After', Math.ceil(rule.windowMs / 1000));
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  // Set standard rate limit headers
  res.setHeader('X-RateLimit-Limit', rule.limit || rule.capacity);
  next();
}
```

### 4. Rules API
```typescript
// src/routes/rules.ts
// POST   /rules         → create rule for API key
// GET    /rules/:key    → get rule
// PUT    /rules/:key    → update rule
// DELETE /rules/:key    → delete rule

// Rule schema stored in Redis as hash:
// rl:rule:{apiKey} → { algorithm, limit, windowMs, capacity, refillRate }

// Example rule payload:
{
  "apiKey": "usr_abc123",
  "algorithm": "sliding_window",   // or "token_bucket"
  "limit": 100,                    // requests per window
  "windowMs": 60000,               // 1 minute window
  // token_bucket only:
  "capacity": 50,
  "refillRate": 10                 // tokens/second
}
```

### 5. Prometheus Metrics
```typescript
// src/observability/metrics.ts
import client from 'prom-client';

client.collectDefaultMetrics();  // CPU, memory, event loop lag

export const requestsTotal = new client.Counter({
  name: 'ratelimiter_requests_total',
  help: 'Total requests processed',
  labelNames: ['api_key', 'algorithm']
});

export const rejectionsTotal = new client.Counter({
  name: 'ratelimiter_rejections_total',
  help: 'Total requests rejected (429)',
  labelNames: ['api_key', 'algorithm']
});

export const middlewareLatency = new client.Histogram({
  name: 'ratelimiter_middleware_duration_seconds',
  help: 'Rate limit check latency',
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1]
});
```

### 6. Docker Compose
```yaml
# docker/docker-compose.yml
version: '3.9'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      redis:
        condition: service_healthy

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    volumes:
      - redis_data:/data

  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

volumes:
  redis_data:
```

### 7. Dockerfile
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src/ ./src/
COPY scripts/ ./scripts/
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY package*.json ./
RUN npm ci --omit=dev
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

## API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /auth/token | none | Issue JWT for admin access |
| POST | /keys | JWT | Create new API key |
| POST | /rules | JWT | Create rate limit rule |
| GET | /rules/:key | JWT | Get rule for key |
| PUT | /rules/:key | JWT | Update rule |
| DELETE | /rules/:key | JWT | Delete rule |
| GET | /metrics | none | Prometheus metrics |
| ANY | /proxy/* | API key | Rate-limited passthrough |

## Environment Variables
```env
PORT=3000
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-here
JWT_EXPIRES_IN=7d
```

## Resume Bullet Points (copy-paste ready)
- Built a Redis-backed Rate Limiter as a Service in Node.js/TypeScript, implementing Token Bucket and Sliding Window algorithms via atomic Lua scripts to eliminate race conditions
- Exposed REST API for per-key rule configuration (algorithm, limits, windows); secured admin routes with JWT
- Instrumented with Prometheus (prom-client) exposing request counts, rejection rates, and middleware latency histograms
- Containerized with Docker multi-stage build; orchestrated with Docker Compose including Redis and Prometheus services
