# ADR-004: jwt for admin endpoint authentication

**date:** 2026-03-11
**status:** accepted

---

## context

the admin endpoints (`POST /keys`, `POST /rules`, `GET /rules/:key`,
`PUT /rules/:key`, `DELETE /rules/:key`) must be protected so that only
authorised operators can configure rate limit rules and issue api keys.

options evaluated:

1. **jwt (json web tokens)** — a stateless token is issued on successful login
   and presented as a `Bearer` token on subsequent requests. the server verifies
   the token signature without a database lookup.

2. **api key for admin** — generate a long-lived admin api key stored in an env
   var. every request checks `Authorization: Bearer <api-key>` against the env
   var.

3. **session-based auth** — server-side session stored in redis, cookie on the
   client. requires session management middleware.

4. **mutual tls** — client certificates for service-to-service auth. overkill for
   a developer-facing service.

---

## decision

use **jwt** with `jsonwebtoken` for admin endpoint authentication.

### rationale

- **stateless**: the server does not need to store session state. any stateless
  node instance can verify any token issued by any other instance, enabling
  horizontal scaling without a shared session store.

- **short-lived tokens**: the `JWT_EXPIRES_IN` env var (default `7d`) limits the
  blast radius of a leaked token without requiring server-side revocation.

- **standard**: jwt is the de facto standard for rest api auth. operators are
  familiar with the pattern.

- **separation of concerns**: the admin jwt (issued via `POST /auth/token`) is
  distinct from the api keys (issued via `POST /keys`) used by end-clients on
  `/proxy/*`. this makes the two auth flows easy to reason about independently.

the alternative (api key for admin) was rejected because it offers no expiry
mechanism without additional infrastructure, and session-based auth requires
a cookie-based client which is atypical for a rest api consumed by cli tools
or backend services.

---

## implementation

- `POST /auth/token` accepts `{ username, password }` and returns a signed jwt
- credentials are compared against `ADMIN_USER` and `ADMIN_PASS` env vars
- `jwtMiddleware` verifies the `Authorization: Bearer <token>` header on each
  protected request
- `signToken` and `verifyToken` helpers are exported from `src/auth/jwtMiddleware.ts`
  so they can be used in tests without going through http

---

## consequences

**positive:**
- no database round-trip on every admin request
- easy to rotate secrets (change `JWT_SECRET`, all existing tokens are instantly
  invalidated)
- easy to test (call `signToken` directly in test setup)

**negative:**
- no revocation before expiry without a denylist (out of scope for v1)
- `JWT_SECRET` must be kept secret; if leaked, any bearer token can be forged
  until the secret is rotated
- hardcoded admin credentials via env vars is appropriate for a developer tool
  but would need a user store for multi-operator scenarios
