# T-0060: Host Stale Token Auto-Recovery

- Status: done
- Milestone: M1
- PRD Reference: 5.1, 6.1, 7.2

## Objective
Prevent stale host sessions from trapping `/host` in a non-recoverable waiting state by automatically invalidating stale local auth and returning the host to `/host/login`.

## Scope
### In
1. Detect host auth/session errors that indicate invalid or revoked host token.
2. Clear persisted host session locally when stale token is detected.
3. Redirect host to `/host/login` with a clear message instead of blocking on room bootstrap.
4. Avoid blind `/host/login -> /host` redirect loops when the cached token is malformed.

### Out
1. Changes to host credential issuance or D1 auth logic.
2. Changes to player token/session behavior.
3. Changes to room state model in Durable Objects.

## Dependencies
1. `PRD.md`
2. `app/host/page.tsx`
3. `app/host/login/page.tsx`
4. `lib/client/live-session.ts`
5. `lib/client/live-api.ts`

## API / Contracts Impacted
1. No API schema changes.
2. Client-side handling of existing auth error codes: `UNAUTHORIZED`, `HOST_SESSION_REVOKED`, `HOST_ACCESS_REVOKED`.

## Data Model Impact (D1/DO/R2)
1. D1: no schema/data contract changes.
2. DO: no schema/state machine changes.
3. R2: no changes.

## Implementation plan (step-by-step)
1. Add host-session fatal error classifier in host runtime UI.
2. Centralize host-session invalidation (`clearHostSession` + local state reset + redirect).
3. Apply centralized invalidation path across bootstrap, refresh, stream, and host-action error branches.
4. Harden login auto-redirect path to avoid redirecting on obviously malformed cached tokens.
5. Run lint/typecheck for touched files and document validation evidence.

## Acceptance criteria
1. Returning to app with stale/invalid host token does not leave host stuck on `في انتظار بيانات الغرفة...`.
2. Host is automatically redirected to `/host/login` when stale host token is detected.
3. Host does not need to click logout first to recover from invalid host token.
4. Valid host sessions continue to auto-enter `/host` without regression.

## Validation checklist
- [x] `npx eslint app/host/page.tsx app/host/login/page.tsx lib/client/live-session.ts`
- [x] `npx tsc --noEmit`
- [x] Manual scenario: stale token in localStorage redirects to `/host/login` and allows immediate fresh login.

## Rollback plan
1. Revert host runtime invalid-session auto-logout path in `app/host/page.tsx`.
2. Revert login route token sanity guard in `app/host/login/page.tsx`.
3. Re-run lint/typecheck to verify rollback state.

## Notes/risks
1. Overly broad fatal classification could force logout on transient non-auth errors; scope classification to auth/session revocation codes.
2. Redirect timing must avoid React state update loops during bootstrap and stream callbacks.

## Validation evidence (2026-03-07)
1. Implemented stale host session recovery in host runtime:
   - `app/host/page.tsx`
   - Added `isStaleHostSessionError` classification for auth/session errors.
   - Added centralized `invalidateHostSession` flow (`clearHostSession` + state reset + redirect to `/host/login`).
   - Wired recovery into room bootstrap, room refresh, stream error handling, and host action paths.
2. Hardened login bootstrap behavior:
   - `app/host/login/page.tsx`
   - Added lightweight cached token sanity check (JWT shape + `role=host` + `exp`).
   - Added relogin notice banner via `?reason=session_expired|access_revoked`.
3. Validation commands:
   - `npx eslint app/host/page.tsx app/host/login/page.tsx lib/client/live-session.ts` ✅ (warnings only, no errors)
   - `npx tsc --noEmit` ✅
4. Manual browser automation scenario (headless, local app at `http://localhost:3005`) ✅
   - Command: `node - <<'NODE' ...` (Playwright script; local execution)
   - Observed result:
     - `step1_token_present: true`
     - `step2_rotation_status: 200`
     - `step2_new_token_differs_from_stored: true`
     - `step3_url_after_stale: http://localhost:3005/host/login`
     - `step3_token_cleared: true`
     - `step4_relogin_success: true`
     - `step4_final_url: http://localhost:3005/host`
