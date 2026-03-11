# ADR-003: algorithm trade-off analysis

**date:** 2026-03-11
**status:** accepted

---

## context

three rate limiting algorithms are supported. each has different trade-offs in
terms of memory usage, burst behavior, accuracy, and implementation complexity.
this ADR documents why all three are included and what each is best suited for.

---

## algorithms

### fixed window counter

**how it works:** divides time into discrete windows of `windowMs` ms. a single
counter is incremented per request. the counter expires automatically when the
window ends.

**redis cost:** one key per rate-limited identifier. O(1) memory.

**burst behavior:** allows up to 2x the configured limit in a short period at
window boundaries. a client can send `limit` requests at the end of window N and
another `limit` at the start of window N+1 before the counter resets.

**best for:** simple, low-stakes rate limiting where boundary bursts are
acceptable. very cheap in redis memory and cpu.

**not suited for:** apis where boundary bursts are a security or stability
concern.

---

### sliding window log

**how it works:** stores a sorted set of request timestamps. on each request,
entries older than `now - windowMs` are pruned, then the remaining count is
compared against `limit`. if under the limit, the new timestamp is added.

**redis cost:** one sorted set per rate-limited identifier. each entry in the
set is approximately 16 bytes. a key with limit=100 can hold at most 100
entries, so maximum memory per key is ~1.6 KB.

**burst behavior:** no boundary burst. the window slides with time, so the
effective limit is always exactly `limit` requests in any `windowMs` ms period.

**best for:** strict rate limiting where boundary bursts must be eliminated.
suitable for security-sensitive endpoints.

**not suited for:** very high-traffic, low-limit scenarios where the set grows
large (though for normal rate limiting this is not a concern).

---

### token bucket

**how it works:** each api key has a bucket that starts with `capacity` tokens.
tokens refill continuously at `refillRate` per second. each request consumes one
token. if the bucket is empty, the request is rejected.

**redis cost:** one hash per rate-limited identifier with two fields: tokens
and last_refill. O(1) memory.

**burst behavior:** allows short bursts up to `capacity` followed by a steady
rate of `refillRate` requests per second. this is intentional and models real
traffic patterns well.

**best for:** traffic shaping and apis where occasional bursts are acceptable but
sustained throughput must be controlled. most flexible for clients that batch
work.

**not suited for:** strict per-window quotas where the total number of requests
in a time period must be exactly bounded.

---

## decision

all three algorithms are supported. the caller selects the algorithm per api key
when creating a rule. this allows different endpoints or clients to use the most
appropriate strategy.

the strategy pattern (`getAlgorithmFn` factory, `AlgorithmFn` type) ensures that
adding a new algorithm in the future requires only:

1. a new lua script (if atomicity is needed)
2. a new function in `src/algorithms/`
3. a new case in the `getAlgorithmFn` switch
4. a unit test

---

## consequences

**positive:**
- operators can choose the right tool for each use case
- the strategy pattern makes the middleware completely decoupled from algorithm details
- new algorithms can be added without changing middleware or routing code

**negative:**
- three algorithms means three sets of unit tests and three lua scripts to maintain
- the `Rule` interface must accommodate all algorithm-specific fields, which
  creates a union type with optional fields
