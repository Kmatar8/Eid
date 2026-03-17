# T-0062: Host Login Search Params Build Fix

- Status: done
- Milestone: M5
- PRD Reference: 6, 10.2, 14

## Objective
Fix the production build regression on `/host/login` caused by client-side search param access during prerender, without changing the host login flow or auth contracts.

## Scope
### In
1. Audit `/host/login` for the Next.js 16 prerender failure tied to `useSearchParams()`.
2. Update the page implementation so production build/prerender succeeds.
3. Preserve the existing relogin notice behavior driven by `?reason=...`.
4. Re-run affected validation and capture evidence.

### Out
1. Changes to host auth APIs or token/session contracts.
2. Host UI redesign unrelated to the build failure.
3. Dependency upgrades unrelated to the failing build.

## Dependencies
1. `PRD.md`
2. `app/host/login/page.tsx`
3. `package.json`

## API / Contracts Impacted
1. No API contract changes.
2. Existing `/host/login?reason=access_revoked|session_expired` notice behavior must remain intact.

## Data Model Impact (D1/DO/R2)
1. D1: no change.
2. DO: no change.
3. R2: no change.

## Implementation plan (step-by-step)
1. Isolate the exact build failure path in `app/host/login/page.tsx`.
2. Refactor search param handling to a Next.js 16-safe pattern for prerendered app routes.
3. Validate with targeted lint, typecheck, and the production worker build command used in deployment.
4. Record evidence here and mark the task complete.

## Acceptance criteria
1. `npm run build:worker` completes successfully without the `/host/login` prerender error.
2. `/host/login` still redirects valid cached host sessions to `/host`.
3. `/host/login?reason=access_revoked|session_expired` still shows the correct Arabic relogin notice.
4. Affected lint/typecheck checks pass.

## Validation checklist
- [x] `npx eslint app/host/login/page.tsx`
- [x] `npx tsc --noEmit`
- [x] `npm run build:worker`

## Rollback plan
1. Revert the `/host/login` search param handling change.
2. Re-run lint, typecheck, and build to confirm the prior state if rollback is required.

## Notes/risks
1. Any fallback for search param handling must not introduce a client/server render mismatch on the login page.
2. The fix should stay minimal to avoid regression in the existing stale-token recovery flow.

## Validation evidence (2026-03-17)
1. `/host/login` build fix:
   - Updated `app/host/login/page.tsx`.
   - Moved the `useSearchParams()` usage into a dedicated notice component rendered inside `Suspense`.
   - Preserved the existing `reason=access_revoked|session_expired` relogin notice strings.
   - Left host token bootstrap/redirect behavior unchanged.
2. Validation commands:
   - `npx eslint app/host/login/page.tsx` ✅
   - `npx tsc --noEmit` ✅
   - `npm run build:worker` ✅
3. Build confirmation:
   - OpenNext completed successfully.
   - Next.js route output now includes `○ /host/login` without the prior `useSearchParams()` prerender failure.
