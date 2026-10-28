# Changelog

## 2.1.0 — review fixes

### Build / runtime breakers
- `AnalyticsEvent` used `Types.ObjectId` as a schema type → now `Schema.Types.ObjectId`.
- `nanoid@5` and `bs58@6` are ESM-only and crash a CommonJS build (`ERR_REQUIRE_ESM`) → nanoid removed (crypto-based codes), bs58 pinned to `^5` (CJS).
- Every `req.ip` passed to `string` params failed `strict` typecheck → `clientIp(req)`.
- `BOOTSTRAP_ADMIN_EMAIL` default `""` failed `.email()` validation when unset → plain string, validated by the seed script.
- `autoIndex` was off in production, so **no unique/TTL indexes were ever created** → always on; `npm run seed` also runs `syncIndexes()`.
- Wallet-only users (no email) collided on the `(tenantId,email)` unique index → partial unique indexes.

### Config
- `z.coerce.boolean()` made `"false"` → `true` (DEMO_MODE, all ENABLE_* flags, TELEGRAM_ENABLED) → strict `true/false/1/0/yes/no` parser.
- Production refuses to boot with `CHANGE_ME` JWT secrets or identical access/refresh secrets.
- Unused/misleading vars removed (`JWT_ADMIN_TTL`, `HELIUS_API_KEY`).

### Auth & sessions
- Refresh tokens are now rotated, allow-listed in Redis, reuse-detected; added `/auth/logout`, `/auth/logout-all`.
- Ban / role change / deactivate / logout-all invalidate existing access tokens immediately (`authcut` check in `requireAuth`).
- Separate JWT audiences (access / refresh / wallet-challenge) + HS256 pinned; a challenge token can no longer be used as an access token.
- Wallet challenges are single-use (Redis NX on `jti`) and the signed message must equal the server-built message.
- Per-account login throttle; constant-time-ish response for unknown users; super_admin can log in.
- Team management enforces role hierarchy (can't edit equal/higher rank, can't self-modify).

### Tenant isolation / data leaks
- Holder cache key is now tenant-scoped.
- Public bootstrap no longer leaks `telegramChatId`; tokens are mapped to a public shape.
- Public market/holder endpoints only serve tokens the tenant has **published** (no open price-proxy). Global unscoped `/market/*` routes removed.
- Admin `PATCH /tokens/:id` is whitelisted (was mass-assignment incl. `tenantId`).
- Public referral tracking accepts only `visit`/`share`; `conversion` (on signup) and `qualified` (first submission) are recorded server-side only.
- Leaderboard masks wallet addresses.

### Correctness
- Rate-limit `handler` threw outside Express' error chain → uses `next()`; limits are Redis-backed (multi-instance safe).
- `getStats` aggregation compared string ids to ObjectIds → casts.
- `GET /memes` crashed (`req.auth!` on a public route) and `/memes/public` 404'd → removed/rewired.
- Holder math used `Number()` on BigInt, "total holders" was capped at the sample size, and Helius results were unsorted → BigInt math, `getTokenLargestAccounts` + owner aggregation, honest `holderCountIsSample` flag, denominator = total supply.
- DexScreener pair selection prefers pools where the mint is the base token.
- Challenge entry is atomic (time window + duplicate check in the update filter); status is computed from dates, not a stale stored field.
- Likes are one-per-user (unique index) with unlike; shares dedupe per user/day; auto-flag at 5 reports; atomic `$inc`s.
- Tokenomics/roadmap replace is insert-then-prune (no empty window on failure).
- Bootstrap cache is invalidated on every admin mutation.
- Seed no longer uses wrapped SOL as the "meme" mint; DEMO_MODE=false never fabricates market/holder data (503 instead) and demo history is flagged via `X-Data-Source: demo`.
- Token "Revoked (verified)" is only shown when verified on-chain; new `POST /admin/tokens/:id/verify`.
- `/admin/integrations` returned fabricated `lastSync` times and a fake "OK" test → real data / real checks.

### Security hardening
- CORS denies by default when `CORS_ORIGINS` is empty; real CSP; 500s no longer echo internal error messages.
- Uploads: magic-byte validation via sharp, re-encode, tenant-namespaced keys, folder allow-list, MulterError → 4xx, `multer@2`.
- `imageUrl` / branding URLs restricted to `https://` or `/uploads/` (no `javascript:`).
- `:id` params validated as ObjectIds; paging clamped; analytics payloads bounded and rate limited.
- Docker: non-root, tini, healthcheck, pruned dev deps, Mongo auth + Redis password, DB ports bound to localhost only.

### New
- `POST/GET/PATCH /super/tenants` (super_admin) — tenants could previously only be created by the seed.
- Unit tests (`npm test`), CI workflow, graceful worker shutdown.
