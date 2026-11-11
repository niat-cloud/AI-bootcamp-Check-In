# TODO — Backend Architecture Review (event-checkin)

Findings from reading the server as it is today (Express 5 + pg + zod on Vercel, Supabase Postgres).
Every item is a checkbox with a stable ID so it can be picked up and tracked one at a time.
Scope is deliberately pragmatic: this is an event-day app (hundreds to a few thousand students per
event, a handful of admins), not a millions-of-users platform. Items are ordered by risk.

## Status (2026-11-12)

Legend: `[x]` done and tested · `[~]` partly done, rest needs a decision · `[ ]` open.

| Item | Status | Where |
|---|---|---|
| 1.1 Migrations | **Partly.** Dev servers no longer migrate a remote DB unless `ALLOW_REMOTE_MIGRATE=1`. Running migrations as part of the Vercel build is **not** done: it would change production on every deploy, so it stays a deliberate `npm run migrate` (README step 3). | `server/src/index.ts`, README |
| 1.2 Health | Done: checks the DB and reports the schema version. | `server/src/app.ts` |
| 1.3 Logs + request ids | Done: one JSON line per API request, `x-request-id` header, id in error bodies, "Ref:" shown on 500s. | `server/src/app.ts` |
| 1.4 CI | Done: GitHub Actions with a Postgres service; build + all tests. Requiring it before deploys is a Vercel setting (yours). | `.github/workflows/ci.yml` |
| 1.5 Backups | Documented (README → Operations). Verifying the Supabase plan's backups is yours. | README |
| 2.1 Indexes | Done (migration 013). | `013_hardening.sql` |
| 2.2 Dashboard | Done: 3 s shared computation per event + ETag 304s. The single-query rewrite is not needed at current scale. | `routes/admin.ts` |
| 2.3 Per-event seat lock | Not needed now (see load-test finding below). | |
| 2.4 Import batching | **Finding was wrong**: the inserts already use `unnest` in one statement; the loop is validation only. Nothing to do. | |
| 2.5 Down migrations | `-- down:` block added to 013; no `migrate:down` script (additive migrations, rollback = redeploy). | |
| 3.1 Security headers | Done in Express and `vercel.json` (static pages bypass Express on Vercel). CSP verified: student flow and 6 admin pages, zero violations. | `app.ts`, `vercel.json` |
| 3.2 Token revocation | Done: `token_version`; a password change signs out other devices and returns a fresh token; `POST /admin/auth/logout-all`. | `lib/auth.ts`, `routes/auth.ts` |
| 3.3 Shared rate limits | Done for sign-in/sign-up (DB table, one upsert). Student pages keep the in-memory limiter to avoid a DB round trip per tap. | `lib/rateLimit.ts` |
| 3.4 Audit | Done: lunch edits, admin approvals/roles, project review/awards/lock/delete. | `lib/audit.ts` |
| 3.5 Default super admin | Done: refused on Vercel/production; README updated. | `lib/auth.ts` |
| 3.6 Body limits + client IP | Done: 100 kb everywhere, 10 mb only for import; `x-real-ip` trusted only on Vercel. | `app.ts`, `lib/rateLimit.ts` |
| 4.1 Region | **Not an issue**: README confirms Supabase is in Seoul next to `icn1`. | |
| 4.2 Pooler | **Already done**: README prescribes the Transaction pooler (6543). | |
| 4.3 Load test | Done: `demo/loadtest.ts`. **It found a real deadlock** (fixed, below). | |
| 5.1 Error shape | Done: `{code, message, requestId, field?}` everywhere. | `app.ts` |
| 5.2 Route → service refactor | Deferred: no behaviour change, moderate risk, low value right now. | |

### Load-test finding (fixed)

`demo/loadtest.ts` found a **deadlock that predates this work**: two walk-ins (new registrations) checking in
at the same moment. Inserting the registration takes a `KEY SHARE` lock on the event row (foreign key), and
the seat allocator then asks for `FOR UPDATE` on the same row, so concurrent walk-ins waited on each other
and Postgres aborted them ("Something went wrong" for the student). Fix: `registerAndSeat` takes the event
lock first (`server/src/services/checkin.ts`). Regression test: 12 simultaneous walk-ins must all be seated
(fails with 500s without the fix, passes with it).

| Run (130 walk-ins, 25 at a time, local) | Seated | Errors | Check-in p95 |
|---|---|---|---|
| Before the fix | 1 | 129 deadlocks | 21,122 ms |
| After the fix | 120 (+10 waiting list, venue full) | 0 | 347 ms |

This also settles **ARCH-ITEM-2.3**: with the lock order fixed, the per-event lock handles ~25 concurrent
check-ins comfortably on a local DB. Per-room locking is not needed now; re-measure against Supabase (with its
~real network latency) before an event larger than ~1,000 students.

Tests: 50 pass (8 new in `server/test/hardening.int.test.ts`).

## Context

- **Project:** AI Bootcamp check-in and project judging (`event-checkin`).
- **Stack:** Node 20+, Express 5, `pg` pool, zod, SQL migrations in `server/src/db/migrations`, React/Vite client.
- **Hosting:** Vercel serverless (`api/index.js` → `createApp()`), region `icn1`, Supabase Postgres. Local demo on embedded Postgres (port 5433).
- **Architecture today:** one monolith; routers `public` (students), `auth`, `platform`, `events`, `gate`, `import`, `projects`, `admin`. Stateless HMAC tokens for admins (7 days, `localStorage`), HMAC "claim" passes for the name search (12 h). In-memory per-instance rate limiter. Transaction + `FOR UPDATE` per event for seat allocation. LLM project scoring claimed with `SKIP LOCKED`.
- **Peak load:** the first 30 minutes of an event: ~100–300 students checking in across one venue, each doing lookup + check-in (2 writes), plus every admin dashboard polling 11 queries every 5 s.
- **SLA to aim for:** check-in round trip under 1.5 s at the venue on mobile data; dashboard refresh under 1 s; zero lost check-ins.
- **Security / data:** student names, phone numbers and parents' phone numbers (minors). No payment data. Keep phone numbers off the client where possible (already done for the name search).

## Architecture Plan

- [ ] **ARCH-PLAN-1.1 [API Layer]**
  - **Pattern:** keep REST + JSON; the app is small and the client is first-party. No GraphQL/gRPC.
  - **Versioning:** add `/api/v1` as the mount point now (one rewrite in `vercel.json`, one constant in `client/src/lib/api.ts`). Costs nothing today, avoids a breaking move later when the QR codes printed on banners point at old paths.
  - **Authentication:** keep HMAC tokens for admins but add the missing pieces: a `tokenVersion` on `admin_users` so a password change or "sign out everywhere" revokes old tokens (ARCH-ITEM-3.2).
  - **Documentation:** generate `openapi.json` from the zod schemas (`zod-to-openapi`) for the ~35 routes; serve at `/api/v1/openapi.json`. Mainly for the next developer, not for consumers.

- [ ] **ARCH-PLAN-1.2 [Data Layer]**
  - Stay on Postgres; the model is relational and the seat allocation relies on transactions and row locks.
  - Migrations stay as plain SQL, but production must run them from a deliberate step, not from the app (ARCH-ITEM-1.1).

- [ ] **ARCH-PLAN-1.3 [Messaging / async]**
  - No queue. The only long job (LLM scoring) already uses the database as a queue with `SKIP LOCKED` and is driven by the admin's browser calling `evaluate-next`. That is fine at this scale. Revisit only if scoring must happen without an admin page open (then a Vercel cron hitting `evaluate-next`).

- [ ] **ARCH-PLAN-1.4 [Security Layer]**
  - Security headers (ARCH-ITEM-3.1), token revocation (3.2), shared rate limiting (3.3), audit log for admin writes (3.4).

## Architecture Items

### 1. Operations (highest risk first)

- [~] **ARCH-ITEM-1.1 [Production migrations are not applied by deploys]**
  - **Finding:** `api/index.js` imports `createApp()` only. `migrate()` runs in `server/src/index.ts`, which Vercel never executes. A deploy that needs migrations 008–012 will ship code against an old schema and fail at runtime (`column "grade" does not exist`). Meanwhile the local `npm run dev` with a production `.env` *does* migrate production, silently.
  - **Fix:** (a) add a `migrate:prod` step to the release checklist / Vercel build (`vercel.json` `buildCommand`: `npm run build && npm run migrate -w server`, with `DATABASE_URL` available at build time), (b) guard `server/src/index.ts` so a dev server refuses to auto-migrate a non-local database unless `ALLOW_REMOTE_MIGRATE=1`.
  - **Patch:**
    ```diff
    --- a/server/src/index.ts
    +++ b/server/src/index.ts
    @@
     const port = Number(process.env.PORT) || 4000;
    
    -const applied = await migrate();
    -if (applied.length) console.log(`Migrations applied: ${applied.join(', ')}`);
    +const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '');
    +if (local || process.env.ALLOW_REMOTE_MIGRATE === '1') {
    +  const applied = await migrate();
    +  if (applied.length) console.log(`Migrations applied: ${applied.join(', ')}`);
    +} else {
    +  console.log('Remote database: skipping auto-migrate (run `npm run migrate` deliberately, or set ALLOW_REMOTE_MIGRATE=1).');
    +}
    ```
  - **Check now:** in the Supabase SQL editor run `SELECT name FROM schema_migrations WHERE name >= '008' ORDER BY name;` to learn whether 008–012 were already applied by a local dev run.

- [x] **ARCH-ITEM-1.2 [Health check does not check the database]**
  - **Finding:** `/api/health` returns `{ok:true}` even when `DATABASE_URL` is wrong or Supabase is paused.
  - **Patch:**
    ```diff
    --- a/server/src/app.ts
    +++ b/server/src/app.ts
    @@
    -  app.get('/api/health', (_req, res) => res.json({ ok: true }));
    +  app.get('/api/health', async (_req, res) => {
    +    try {
    +      const { rows: [m] } = await pool.query('SELECT max(name) AS latest FROM schema_migrations');
    +      res.json({ ok: true, db: 'up', migration: m?.latest ?? null });
    +    } catch (err) {
    +      res.status(503).json({ ok: false, db: 'down' });
    +    }
    +  });
    ```
    (add `import { pool } from './db/pool.js';`). Point an uptime monitor (UptimeRobot / Better Stack, free tier) at it during event days.

- [x] **ARCH-ITEM-1.3 [No structured logs, no request IDs]**
  - **Finding:** 5 `console.*` calls in total; the error handler logs the stack and nothing else. During an event, "a student couldn't check in" cannot be traced to a request.
  - **Fix:** a 20-line middleware: generate `x-request-id` (or reuse Vercel's `x-vercel-id`), log one JSON line per request (`method, path, status, ms, requestId, adminId?, eventId?`), and include `requestId` in the 500 error body so the help desk can quote it. No library needed; Vercel captures stdout.

- [x] **ARCH-ITEM-1.4 [No CI]**
  - **Finding:** no `.github/workflows`. 42 tests exist (including 2 DB integration tests) but nothing runs them before deploy.
  - **Fix:** one workflow: `npm ci`, `tsc` for both workspaces, `vitest run` with a `postgres:16` service container and `DATABASE_URL` set, on every PR and on `main`. Block Vercel production deploys on it (Vercel → Git → "Require checks").

- [x] **ARCH-ITEM-1.5 [Backups / recovery not documented]**
  - **Fix:** write down: Supabase daily backups are on (verify plan), plus a manual `pg_dump` before each event and after check-in closes (`npm run export` of participants already exists as a CSV safety net). One paragraph in `README`.

### 2. Data layer

- [x] **ARCH-ITEM-2.1 [Missing indexes for the hot paths]**
  - **Finding:** `participants.phone` is UNIQUE (good). Missing: `event_participants (event_id, status)` for the dashboard counts and waiting list; `event_participants (participant_id)` for the lookup join (`LEFT JOIN event_participants ep ON ep.participant_id = p.id`); `admin_locations (location_id)`; `event_participants (event_id, lunch)` is not needed (small table), skip.
  - **Migration `013_hot_path_indexes.sql`:**
    ```sql
    CREATE INDEX IF NOT EXISTS event_participants_participant_idx ON event_participants (participant_id);
    CREATE INDEX IF NOT EXISTS event_participants_event_status_idx ON event_participants (event_id, status);
    CREATE INDEX IF NOT EXISTS admin_locations_location_idx ON admin_locations (location_id);
    ```
  - Verify with `EXPLAIN ANALYZE` on the lookup and dashboard queries using the demo DB with 100 rows scaled ×20 (`demo/participants-100.xlsx` duplicated).

- [x] **ARCH-ITEM-2.2 [Dashboard polling cost]**
  - **Finding:** every open admin dashboard runs 12 queries every 5 s (`getDashboard`). Five admins = 144 queries/min against a 3-connection pool per instance.
  - **Fix (cheap):** cache the dashboard result per event in module memory for 3 s (serverless instances are reused within a burst), and send `ETag` so unchanged polls return 304. Fix (better, later): a single `dashboard_counters` query using one `GROUP BY` instead of 12 round trips.

- [ ] **ARCH-ITEM-2.3 [Seat allocation lock is per event, correct but serial]**
  - **Finding:** `assignSeatTx` takes `FOR UPDATE OF e` on the event row, so check-ins for one event run one at a time. With ~150 ms DB latency from `icn1` to Supabase that caps throughput at roughly 3–4 check-ins/s per event. Fine for 300 students over 30 minutes; a problem for 2,000 students in 15 minutes.
  - **Fix (only if needed):** lock per room instead of per event (`FOR UPDATE OF r` on the chosen room), and move the Vercel region next to the Supabase region (check Supabase project region; if it is `ap-south-1`, use Vercel `bom1`). The region change alone can halve check-in latency.

- [x] **ARCH-ITEM-2.4 [Import runs row-by-row]**
  - **Finding:** `import.ts` loops over up to 20,000 rows with per-row `INSERT … ON CONFLICT`. 2,000 rows × 150 ms ≈ 5 minutes, past Vercel's 60 s `maxDuration`.
  - **Fix:** batch with `UNNEST($1::text[], $2::text[] …)` in one statement per 1,000 rows, inside the existing transaction.

- [ ] **ARCH-ITEM-2.5 [Reversible migrations]**
  - Add a `-- down:` comment block to each migration from 013 onward with the reverse statements, and a `migrate:down <name>` script. Existing 001–012 are additive; document that rollback is "redeploy previous code; columns stay".

### 3. Security

- [x] **ARCH-ITEM-3.1 [No security headers, no CORS policy]**
  - **Finding:** no `helmet`, no CSP, no HSTS. The client and API share an origin, so CORS is implicitly closed (good), but nothing stops framing or MIME sniffing.
  - **Fix:** `npm i helmet` and `app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'blob:'], mediaSrc: ["'self'", 'blob:'], connectSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"] } } }))`. Test the QR scanner (camera `blob:`) and the project screenshot images after enabling.

- [x] **ARCH-ITEM-3.2 [Admin tokens cannot be revoked]**
  - **Finding:** tokens are `HMAC(sub, exp)` valid 7 days and stored in `localStorage`. A stolen token on a shared gate laptop stays valid after the admin changes their password or is removed.
  - **Fix:** add `token_version INTEGER NOT NULL DEFAULT 1` to `admin_users`; include `v` in the token payload; `loadAdmin` rejects mismatches; bump on password change, on "sign out everywhere", and when an admin is disabled. Shorten gate-laptop sessions to 24 h (`TOKEN_TTL_MS` by role, or a `remember` flag at login).

- [x] **ARCH-ITEM-3.3 [Rate limits are per serverless instance]**
  - **Finding:** `rateLimiter` is an in-memory `Map`; on Vercel each instance counts separately, so the login limit of 10/10 min is effectively unlimited across instances.
  - **Fix:** one small table `rate_limits (key TEXT PRIMARY KEY, count INT, reset_at TIMESTAMPTZ)` and a single `INSERT … ON CONFLICT DO UPDATE … RETURNING count` per check (one round trip, no Redis). Apply to login, sign-up and the name search; keep the in-memory one as a first filter.

- [x] **ARCH-ITEM-3.4 [No audit trail for admin writes]**
  - **Finding:** `allocation_log` covers seating changes only. Removing registrations, changing lunch, awards, approving admins leave no record.
  - **Fix:** `admin_audit (id, admin_id, event_id, action, target, details JSONB, created_at)` written from one helper, called in the write routes (`participants/remove`, `lunch`, `awards`, `admins/*`).

- [x] **ARCH-ITEM-3.5 [Default super-admin credentials]**
  - **Finding:** `admin@niat.edu / admin123` is created on first sign-in unless env vars are set; `must_change_password` mitigates it, but the account exists with a known password until someone signs in.
  - **Fix:** refuse to create the super admin with the default password in production (`process.env.VERCEL`), and fail loudly asking for `SUPER_ADMIN_PASSWORD`.

- [x] **ARCH-ITEM-3.6 [Input validation gaps]**
  - `express.json({ limit: '10mb' })` applies to every route; limit public routes to `100kb` and keep `10mb` only on `/import`.
  - `clientIp` trusts the first `x-forwarded-for` entry; on Vercel use `x-real-ip` (set by the platform, not by the client).

### 4. Performance

- [x] **ARCH-ITEM-4.1 [Region mismatch]** — see 2.3. Measure with `SELECT 1` timing from a Vercel function; if > 50 ms, move the function region next to the database.
- [x] **ARCH-ITEM-4.2 [Connection pooling]** — `max: 3` per instance is right for serverless, but use Supabase's pooler URL (port 6543, transaction mode) in `DATABASE_URL` for Vercel so bursts of instances don't exhaust Postgres connections. Note `FOR UPDATE` inside `withTransaction` still works in transaction mode; `SET search_path` via `options` does not — only the demo uses `DATABASE_SCHEMA`.
- [x] **ARCH-ITEM-4.3 [Load test before the next event]** — a `k6` script that replays 300 lookups + check-ins against the demo DB in 5 minutes; assert p95 < 1.5 s and zero `SEAT assignment failed`.

### 5. Code structure

- [x] **ARCH-ITEM-5.1 [Standard error shape]** — `AppError` and `ZodError` return `{code, message}`; 500s return the same shape. Add `requestId` (1.3) and, for zod, `field`. Document the codes the client switches on (`VENUE_FULL`, `EVENT_NOT_ACTIVE`, `INVALID_CLAIM`, `PARENT_NAME_REQUIRED`, `ALREADY_REGISTERED`) in one `lib/errorCodes.ts`.
- [ ] **ARCH-ITEM-5.2 [Route → service boundary]** — `routes/admin.ts` (330 lines) and `routes/import.ts` hold SQL directly; move them into `services/participants.ts` / `services/import.ts` like `checkin.ts` and `seating.ts` already do, so the integration tests can call services without HTTP.

## Commands

```bash
# local
npm run demo                 # embedded Postgres on 5433 + API 4100 + client 5180
npm test                     # unit tests (DB tests skipped without DATABASE_URL)
DATABASE_URL=postgres://postgres:demo@localhost:5433/demo DATABASE_SSL=false AUTH_SECRET=test npm test -w server

# production (deliberate, once per release — see ARCH-ITEM-1.1)
npm run migrate -w server    # with the production DATABASE_URL in the environment

# CI (ARCH-ITEM-1.4)
npm ci && npx tsc -p client --noEmit && npx tsc -p server --noEmit && npm test -w server
```

## Quality Assurance Checklist

- [ ] Every `/api/events/:id/*` route is behind `requireAdminAuth` + `requireEventAccess` (true today; keep a test that asserts 401/403 for each router).
- [ ] Production schema equals the latest migration before each deploy (health endpoint reports it, ARCH-ITEM-1.2).
- [ ] Error bodies are `{code, message, requestId}` everywhere.
- [ ] Dashboard cache and ETag in place; check-in p95 < 1.5 s in the load test.
- [ ] Security headers on, tokens revocable, rate limits shared.
- [ ] Rollback = redeploy previous build; migrations 013+ carry `-- down:` blocks.
- [ ] Backup taken before and after each event.
