# T-0037: Host Code-Only Activation, 60-Day Access, and Single-Device Session

- Status: done
- Milestone: M1
- PRD Reference: 5.1, 6.1, 10.2, 11, 13, 15

## Objective
Switch host onboarding to code-only distribution, move password creation to first login activation, enforce 60-day access from activation time, and prevent concurrent host login across multiple devices.

## Scope
### In
1. Add first-time activation flow from `/host/login` using code + new password.
2. Keep returning-host login with code + password.
3. Enforce host access expiry at exactly `60 days` from activation timestamp.
4. Enforce single-device host session using server-side active session nonce.
5. Regenerate `500` new host codes using code-only setup.
6. Update D1 sync script to import code-only CSV and keep activation compatibility.

### Out
1. Password reset or recovery flow.
2. Admin panel for code/session management.
3. Changes to player authentication/session logic.

## Dependencies
1. Existing D1 `host_access_codes` table and login route from T-0028/T-0029.
2. Existing token signing/verification (`lib/server/token.ts`).
3. Existing host room authorization paths (`room-auth`, room state/actions/events/stream routes).

## API / Contracts Impacted
1. New endpoint: `POST /api/auth/host/activate`
   - request: `{ username: code, password }`
   - success: `{ token, host }`
2. Existing endpoint: `POST /api/auth/host/login`
   - returns `409 HOST_CODE_NOT_ACTIVATED` when code exists but is not activated.
3. Host token contract:
   - add required `sessionId` claim for host role.
4. Host-protected room routes reject stale host tokens:
   - `401 HOST_SESSION_REVOKED`

## Data Model Impact (D1/DO/R2)
1. D1:
   - `host_access_codes` add `active_session_id` column.
   - Activation updates `password_hash`, `activated_at`, `redeemed_at`, `access_expires_at`.
2. DO/In-memory store:
   - add `activeSessionId` to host records for fallback auth/session checks when D1 is unavailable.
3. R2:
   - no change.

## Implementation plan (step-by-step)
1. Update PRD auth/session requirements for code-only activation + 60-day validity + single-device session.
2. Add D1 migration for `active_session_id`.
3. Refactor host D1 auth service to:
   - support activation endpoint behavior
   - use fixed `60-day` duration
   - rotate active session nonce on successful activation/login
   - validate active session nonce for host requests
4. Add `POST /api/auth/host/activate` route.
5. Update `POST /api/auth/host/login` to require prior activation and return activation-needed error code.
6. Update host login UI/client API:
   - auto-switch to activation mode when `HOST_CODE_NOT_ACTIVATED` is returned.
7. Enforce host session checks in all host-protected room routes and shared actor resolver.
8. Update fallback in-memory auth/store to mirror 60-day + single-device behavior.
9. Regenerate 500 code-only credentials and align generated artifacts/scripts.
10. Run lint/typecheck/build and document validation evidence.

## Acceptance criteria
1. New code from seed list can activate only via `/api/auth/host/activate` with code + chosen password.
2. `/api/auth/host/login` for non-activated code returns `HOST_CODE_NOT_ACTIVATED`.
3. Access expiry equals activation timestamp + 60 days (not generation time).
4. Second login from another device invalidates the first device host token; first device receives `HOST_SESSION_REVOKED` on protected host APIs.
5. Regenerated seed file contains exactly 500 code rows and no plaintext password column.
6. D1 sync script imports code-only CSV without requiring plaintext password input.

## Validation checklist
- [x] Migration applied locally (`wrangler d1 migrations apply ... --local`).
- [x] Targeted lint passes on changed auth/session/UI/script files.
- [x] `npm run build` passes.
- [x] Manual API: non-activated code login returns `HOST_CODE_NOT_ACTIVATED`.
- [x] Manual API: activation succeeds and sets 60-day expiry.
- [x] Manual API: stale host token rejected after second login/activation session rotation.
- [x] Seed regeneration output verified: 500 code-only rows.

## Validation Evidence (2026-03-01)
1. PRD updates applied for:
   - code-only host distribution + first-login activation
   - fixed `60 days` access validity from activation
   - single-device host session invalidation policy
2. New API route implemented:
   - `POST /api/auth/host/activate`
3. Host auth contract updates:
   - host token now includes required `sessionId`
   - host route auth checks validate active session nonce and reject stale tokens with `HOST_SESSION_REVOKED`
4. D1 migration:
   - added `migrations/0004_host_access_codes_active_session.sql`
   - local apply: `wrangler d1 migrations apply hroof-main-db --local` ✅
   - remote apply: `wrangler d1 migrations apply hroof-main-db --remote` ✅
5. Seed/script updates:
   - regenerated code-only seeds with `npm run seed:redeem-codes -- 500 docs/seeds/host-redeem-codes.csv 12 lib/server/host-credentials.generated.json`
   - verified CSV line count: `501` (header + 500 codes)
   - updated D1 sync script for code-only CSV + placeholder hash insertion
6. D1 sync execution:
   - local sync: `npm run sync:host-codes:d1 -- docs/seeds/host-redeem-codes.csv --local` ✅
   - remote sync: `npm run sync:host-codes:d1 -- docs/seeds/host-redeem-codes.csv --remote` ✅
   - remote verification query result: `active_codes=500` (with preserved historical redeemed rows)
7. Manual API verification (`next dev` at `http://127.0.0.1:4015`):
   - login before activation returns `409 HOST_CODE_NOT_ACTIVATED` ✅
   - activation succeeds and returns host token ✅
   - second login rotates host session ✅
   - `POST /api/rooms/create` with stale token returns `401 HOST_SESSION_REVOKED` ✅
   - `POST /api/rooms/create` with latest token returns `201` room created ✅
8. 60-day window verification:
   - D1 query `(access_expires_at - activated_at) AS window_ms` returned `5184000000` (`60 days`) ✅
9. Build/lint:
   - targeted lint command on changed files passed ✅
   - `npm run build` passed (route map includes `/api/auth/host/activate`) ✅

## Rollback plan
1. Revert auth route changes (`activate` endpoint and login behavior).
2. Revert token/session claim enforcement and host-route nonce validation.
3. Revert D1 migration by forward-fix (ignore new column) and disable single-device checks.
4. Restore previous seed/script format if operational rollback is required.

## Notes/risks
1. Session nonce checks add DB reads on host-protected APIs; monitor for latency impact.
2. Deploying session-claim enforcement invalidates old host tokens, requiring host re-login.
3. Code-only seeding requires placeholder password hashes before activation due existing non-null DB constraint.
