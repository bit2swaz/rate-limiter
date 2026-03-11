# ADR-002: ioredis over node-redis

**date:** 2026-03-11
**status:** accepted

---

## context

two mature node.js redis clients were evaluated: `ioredis` (v5) and `node-redis`
(v4). the choice matters because both the lua script loading mechanism and the
typescript integration differ significantly between them.

---

## decision

use **ioredis v5**.

### evaluation criteria

| criterion | ioredis v5 | node-redis v4 |
|-----------|-----------|---------------|
| `defineCommand` / custom commands | yes, built-in, returns typed result | no built-in; requires `sendCommand` + manual typing |
| lua script loading | `defineCommand` attaches the script as a method on the client | manual `sendCommand('EVAL', ...)` or a wrapper |
| typescript support | has `@types/ioredis` bundled in the package | built-in typescript types in v4 |
| promise-based api | yes (all commands return promises) | yes |
| cluster support | yes (`new Redis.Cluster(...)`) | yes |
| sentinel support | yes | yes |
| weekly downloads (approx.) | ~8m | ~6m |
| activity | actively maintained | actively maintained |

the decisive factor is `defineCommand`. this allows attaching lua scripts as
first-class typed methods on the redis client:

```typescript
redis.defineCommand('evalTokenBucket', {
  numberOfKeys: 1,
  lua: tokenBucketScript,
});

// called as:
const [allowed, remaining] = await redis.evalTokenBucket(key, capacity, refillRate, now);
```

with node-redis the equivalent requires wrapping `sendCommand` with manual
argument marshalling and a type assertion on the return value. this is
boilerplate that adds noise and reduces type safety.

---

## consequences

**positive:**
- lua scripts integrate cleanly as typed commands
- well-documented api with extensive examples
- simple connection via a single `REDIS_URL` env var

**negative:**
- `ioredis` commands are `snake_case` (e.g. `hgetall`) while `node-redis` v4
  uses `hGetAll`; the codebase must be consistent and not mix clients
- migrating to node-redis later would require updating all call sites and the
  lua script loading mechanism
