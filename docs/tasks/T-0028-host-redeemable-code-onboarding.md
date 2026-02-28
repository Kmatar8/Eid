# T-0028: Host Credential Code + Password Access Flow

- Status: done
- Milestone: M1
- PRD Reference: 4, 5, 6.1, 10.1, 11, 13, 15

## Objective
Deliver host authentication using pre-issued credential pairs from CSV:
1. Each host uses `code + password` directly on `/host/login` (code acts as username).
2. No email input or account setup step in host UI.
3. Generated credential pairs are bundled and available in deployed runtime.
4. Host access is revoked 30 days after activation (first successful login).

## Scope
### In
1. Update PRD auth requirements to code/password credential flow.
2. Update host login UI to accept only code + password.
3. Generate 500 `code,password` credentials and store in CSV.
4. Bundle generated credentials for deployed runtime lookup.
5. Seed host credentials in runtime store with hashed passwords.

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
1. Primary flow uses `POST /api/auth/host/login` with:
   - request: `{ username: code, password }`
   - success: `{ token, host }`
2. `POST /api/auth/host/redeem` + `POST /api/auth/host/register` become legacy/non-primary and are no longer required by host UI.

## Data Model Impact (D1/DO/R2)
1. `D1`: `hosts` stores issued credential code (`username`) + hashed password + optional `access_expires_at`.
2. `DO`: no authority change; host role checks and room authority remain unchanged.
3. `R2`: no change.

## Implementation Plan
1. Update `PRD.md` sections for host auth journey.
2. Generate `code,password` credential pairs (CSV + bundled JSON).
3. Extend host seed loading to prefer env JSON, then bundled JSON, then CSV.
4. Update `/host/login` to code/password-only experience.
5. Keep host access revocation window at 30 days after first successful login.
6. Run lint/typecheck and capture validation evidence.

## Acceptance Criteria
1. `/host/login` accepts code + password only (no email/setup form).
2. Generated CSV contains 500 rows with `code,password`.
3. Deployed runtime can authenticate using generated credential pairs from bundled seed file.
4. Successful login activates host access window and expiry revokes further access.

## Validation Checklist
- [x] Lint/typecheck pass for changed code.
- [x] Manual: code/password login from CSV succeeds.
- [x] Manual: second code/password pair also succeeds.
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
14. Seed availability fix:
   - replaced redeem-only bundle with host credential bundle `lib/server/host-credentials.generated.json` to ensure deploy runtimes can authenticate generated code/password pairs without filesystem CSV access.
   - host seed precedence now: `HROOF_HOST_CREDENTIALS_JSON` env -> bundled host-credentials JSON -> CSV file -> demo fallback.
15. Credential sync + activation fix (customer bug report: `REDEEM_CODE_NOT_FOUND`):
   - store seeding is now idempotent beyond initial boot; host/redeem seeds are re-applied on store access so regenerated CSV credentials are imported into hydrated DO snapshots.
   - `seedHosts` and `seedRedeemCodes` now bump store revision when new records are inserted, ensuring persistence.
16. Host access activation behavior:
   - on first successful `POST /api/auth/host/login`, host `accessExpiresAt` is set to `now + 30 days`.
   - expired hosts are rejected (authentication returns no host).
17. Legacy flow deprecation:
   - `POST /api/auth/host/redeem` now returns `410 HOST_REDEEM_DEPRECATED`.
   - `POST /api/auth/host/register` now returns `410 HOST_REGISTER_DEPRECATED`.
18. Manual API verification (local `next dev` on `127.0.0.1:4012`):
   - credential #1 from CSV login succeeded (`200`) ✅
   - credential #2 from CSV login succeeded (`200`) ✅
   - redeem endpoint returns deprecation (`410`) instead of not-found mismatch ✅
19. Validation commands after bug fix:
   - `npx eslint app/api/auth/host/login/route.ts app/api/auth/host/redeem/route.ts app/api/auth/host/register/route.ts app/host/login/page.tsx lib/client/live-api.ts lib/server/store.ts scripts/generate-redeem-codes.mjs README.md PRD.md docs/tasks/T-0028-host-redeemable-code-onboarding.md` ✅ (docs files ignored warnings only)
   - `npm run build` ✅

## Rollback Plan
1. Revert PRD auth section changes.
2. Revert new redeem/register routes and host login onboarding UI.
3. Disable redeem code requirement by routing all hosts through existing login only.
4. Roll back migration by dropping `redeem_codes` and `hosts.email` (or deploy forward fix with nullable unused column).

## Notes / Risks
1. CSV distribution is sensitive; plaintext codes must be handled as secrets operationally.
2. In-memory seed fallback must stay bounded and deterministic in non-D1 runtime.
3. Setup token TTL must remain short to reduce replay risk.
