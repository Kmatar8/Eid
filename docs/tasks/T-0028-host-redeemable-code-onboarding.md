# T-0028: Host Redeemable Code Onboarding + Account Setup

- Status: in_progress
- Milestone: M1
- PRD Reference: 4, 5, 6.1, 10.1, 11, 13, 15

## Objective
Replace host entry from pre-generated username/password to a redeemable-code onboarding flow:
1. Host enters redeemable code.
2. If valid, host completes account setup with email, username, and password.
3. System issues normal host session token after setup.
4. Existing host username/password login remains available for returning hosts.
5. Host account access is revoked 30 days after activation (successful redeem registration).

## Scope
### In
1. Update PRD auth requirements to redeemable onboarding model.
2. Add host redeem/register auth APIs.
3. Add redeem-code + setup UI flow on `/host/login`.
4. Add redeem-code domain model in runtime store and schema migration for persistence shape.
5. Generate 500 redeemable codes and store in CSV for operational seeding.

### Out
1. Admin dashboard for code management.
2. Email delivery/verification workflow.
3. Password reset and account recovery flows.
4. Full D1-backed runtime migration (keep current store authority behavior intact).

## Dependencies
1. Existing host token issuance and room lifecycle flow from T-0001.
2. Existing password hashing utilities (`lib/server/password.ts`).
3. Existing shared store synchronization layer (`lib/server/store-sync.ts`).

## API / Contract Impact
1. Add `POST /api/auth/host/redeem`
   - request: `{ code }`
   - success: `{ setupToken, email }`
2. Add `POST /api/auth/host/register`
   - request: `{ setupToken, email, username, password }`
   - success: existing host login shape `{ token, host }`
3. Keep `POST /api/auth/host/login` for returning hosts.
4. Add setup-token claim validation helper in token module.

## Data Model Impact (D1/DO/R2)
1. `D1`: add `hosts.email` unique index.
2. `D1`: add `hosts.access_expires_at` for host account revocation window.
3. `D1`: add `redeem_codes` table with one-time-use lifecycle metadata and optional pre-bound email.
4. `DO`: no authority change; host role checks and room authority remain unchanged.
5. `R2`: no change.

## Implementation Plan
1. Update `PRD.md` sections for host auth and onboarding journey.
2. Extend server types/store:
   - host email field
   - redeem code record + one-time consume flow
   - host registration flow with uniqueness checks
3. Extend token utilities with setup token role/verification helper.
4. Add API routes:
   - `/api/auth/host/redeem`
   - `/api/auth/host/register`
5. Update host login page to two-step flow while preserving returning host login.
6. Add migration for `hosts.email` and `redeem_codes` table.
7. Generate 500 redeemable codes CSV with deterministic scriptable format.
8. Run lint/typecheck and capture validation evidence.

## Acceptance Criteria
1. New host can redeem valid unused code and receive setup token tied to redeem context.
2. Register endpoint accepts setup token + matching email + username/password and creates host account once.
3. Redeemed code cannot be reused.
4. Duplicate username or duplicate email is rejected with stable error codes.
5. Returning hosts can still log in with username/password.
6. `/host/login` supports two-step onboarding UX and returns host to `/host` after successful setup.
7. A CSV file containing 500 redeemable codes exists in repo for seeding/ops.

## Validation Checklist
- [x] Lint/typecheck pass for changed code.
- [ ] Manual: redeem -> register -> redirect to `/host`.
- [x] Manual: reused code rejected.
- [x] Manual: duplicate username/email rejected.
- [x] Manual: returning host login still works.
- [x] Evidence recorded in this task file.

## Validation Evidence (2026-02-28)
1. PRD updated to replace pre-generated host credential model with redeemable onboarding flow.
2. Added API routes:
   - `POST /api/auth/host/redeem`
   - `POST /api/auth/host/register`
3. Added store/token/domain updates:
   - host email support
   - redeem code seed + one-time redemption logic
   - setup-token role validation (`host_setup`)
4. Host login page updated to two-step onboarding with fallback returning-host sign-in.
5. Added migration: `migrations/0002_host_redeem_codes.sql`.
6. Generated 500 redeem codes CSV:
   - `docs/seeds/host-redeem-codes.csv` (501 lines including header).
7. Validation commands:
   - `npm run build` ✅
   - `npx eslint app/api/auth/host/login/route.ts app/api/auth/host/redeem/route.ts app/api/auth/host/register/route.ts app/host/login/page.tsx lib/client/live-api.ts lib/server/store.ts lib/server/token.ts lib/server/types.ts scripts/generate-redeem-codes.mjs` ✅
   - `npm run lint` ⚠️ fails due pre-existing unrelated repo errors in other files.
8. Manual API flow checks (local `next dev` on `127.0.0.1:4010`):
   - redeem + register success (`HROOF-FDH5-JWS5` -> `host-001`) ✅
   - reused code rejected (`REDEEM_CODE_ALREADY_REDEEMED`) ✅
   - duplicate username rejected (`USERNAME_TAKEN`) ✅
   - returning host login works for newly registered account (`host-001`) ✅
9. Flow update (customer request):
   - redeem codes now generated as random alphanumeric only (no `HROOF` prefix).
   - setup email is user-entered by default; code pre-bound email is optional.
   - new CSV generated with `code` format and 500 rows.
   - redeemed-code expiry set to `30 days` after successful redemption (unused codes no default time expiry).
10. Manual API checks after update (local `next dev` on `127.0.0.1:4010`):
   - redeem returns `prefillEmail: null` for unbound code ✅
   - register succeeds with user-provided email (`khaled+host1@example.com`) ✅
   - duplicate email rejected (`EMAIL_TAKEN`) ✅
   - code reuse rejected (`REDEEM_CODE_ALREADY_REDEEMED`) ✅
11. Expiration update (customer request):
   - active (unused) codes no longer have default time-based expiry.
   - redeemed codes now get `expiresAt = redeemedAt + 30 days`.
   - CSV regenerated with 500 codes (`code` column only).
12. Access revocation update (customer request):
   - host records now include `accessExpiresAt`.
   - on successful registration, `accessExpiresAt = createdAt + 30 days`.
   - host login token TTL is capped by remaining access window; account cannot authenticate after expiry.
13. Manual revocation check:
   - started local dev with seeded host having past `accessExpiresAt` (`946684800000` / Jan 1, 2000 UTC).
   - `POST /api/auth/host/login` for that host returned `401 INVALID_CREDENTIALS` as expected.

## Rollback Plan
1. Revert PRD auth section changes.
2. Revert new redeem/register routes and host login onboarding UI.
3. Disable redeem code requirement by routing all hosts through existing login only.
4. Roll back migration by dropping `redeem_codes` and `hosts.email` (or deploy forward fix with nullable unused column).

## Notes / Risks
1. CSV distribution is sensitive; plaintext codes must be handled as secrets operationally.
2. In-memory seed fallback must stay bounded and deterministic in non-D1 runtime.
3. Setup token TTL must remain short to reduce replay risk.
