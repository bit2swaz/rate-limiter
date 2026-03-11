# ADR-001: redis lua scripts for atomic rate limit operations

**date:** 2026-03-11
**status:** accepted

---

## context

rate limit counters must be incremented and checked atomically. if the read and
write are separate commands, two concurrent requests can both read the same
count, both see it as under-limit, and both be allowed — violating the configured
limit. this is the classic check-then-act race condition.

three options were evaluated:

1. **lua scripts** — send a single lua script to redis that reads, mutates, and
   returns in one atomic operation. redis is single-threaded and guarantees
   that no other command is interleaved during script execution.

2. **redis transactions (`MULTI`/`EXEC`)** — wrap commands in a transaction.
   however, transactions do not allow branching based on intermediate values;
   you cannot read a value inside a `MULTI` block and conditionally execute
   different commands based on it.

3. **optimistic locking (`WATCH`/`MULTI`/`EXEC`)** — watch a key before reading
   it; if the key changes between the `WATCH` and `EXEC`, the transaction aborts
   and must be retried. this pushes retry logic into the application and adds
   round trips.

---

## decision

use redis lua scripts (`EVAL`) for all algorithms that require read-modify-write
atomicity:

- **token_bucket**: reads current tokens and last_refill, calculates new token
  count, conditionally decrements, and writes back — all in one lua execution.
- **sliding_window**: prunes old entries, counts remaining, conditionally adds
  the new entry — all in one lua execution.

the fixed_window algorithm uses `INCR` + `PEXPIRE`. `INCR` is itself atomic in
redis, and the `PEXPIRE` on count == 1 introduces a tiny window where the expire
might not be set if the process crashes between the two commands. this is
acceptable for fixed_window because the counter will simply persist without
expiring, which is a conservative failure mode (requests remain blocked rather
than incorrectly allowed). a lua script could eliminate this too, but the
tradeoff is not worth the added complexity for fixed window.

scripts are loaded at startup via ioredis `defineCommand` and called as typed
methods on the redis client.

---

## consequences

**positive:**
- zero over-counting under any level of concurrency (proven by the concurrency
  tests in `tests/integration/concurrency.test.ts`)
- no retry logic in the application
- scripts live in version-controlled `.lua` files, easy to audit and test

**negative:**
- lua is a runtime language; type errors in scripts are not caught at compile time
- scripts must be re-loaded on redis restart (handled automatically by the
  ioredis `defineCommand` on connection)
- redis cluster requires all keys used in one lua script to be on the same shard
  (not an issue for single-node redis; a concern for future cluster migration)
