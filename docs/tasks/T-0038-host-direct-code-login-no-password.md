# T-0038: Host Direct Code Login (No Password Setup)

- Status: done
- Milestone: M1
- PRD Reference: 5.1, 6.1, 10.2, 11, 13, 15

## Objective
Replace host auth flow with direct redeem-code login only. Host enters code and logs in immediately without setting or entering a password.

## Scope
### In
1. Update host login API to authenticate by code only.
2. Auto-activate code on first successful login and keep `60-day` validity from first successful login.
3. Keep single-device host session enforcement (session nonce rotation + stale token rejection).
4. Remove activation/password UI and client API usage from `/host/login`.
5. Regenerate/update docs/scripts references to code-only auth semantics.

### Out
1. Password reset/recovery flows.
2. Player auth/session changes.
3. New admin UI for code management.

## Dependencies
1. T-0037 session nonce enforcement and token/session checks.
2. Existing D1 `host_access_codes` table with `active_session_id`.
3. Existing host room protection via `room-auth` and room routes.

## API / Contracts Impacted
1. `POST /api/auth/host/login`
   - request: `{ username: code }`
   - success: `{ token, host }`
   - first successful login activates code automatically.
2. `POST /api/auth/host/activate`
   - deprecated (returns `410`).
3. Host token contract remains:
   - includes `sessionId`.

## Data Model Impact (D1/DO/R2)
1. D1:
   - no new schema change.
   - `activated_at` + `access_expires_at` set during first successful code login.
2. DO/In-memory store:
   - host fallback auth no longer requires password verification.
3. R2:
   - no change.

## Implementation plan (step-by-step)
1. Update PRD for direct code-only login and remove password setup requirement.
2. Refactor D1 auth logic to login by code only and auto-activate on first successful login.
3. Refactor in-memory fallback auth to mirror code-only behavior and keep session rotation.
4. Update login route contract to accept code only.
5. Deprecate `/api/auth/host/activate` endpoint.
6. Update host login UI and client API to code-only input.
7. Update docs/scripts references (README/smoke flow) to remove password dependency.
8. Run lint/build and manual API validation.

## Acceptance criteria
1. Host can log in using code only (no password field in UI/API payload required).
2. First successful code login sets activation timestamp and 60-day access window.
3. Returning code login works until expiry and continues rotating session nonce.
4. Old host token becomes invalid immediately after a newer login from another device (`HOST_SESSION_REVOKED`).
5. `/api/auth/host/activate` is not required for flow and returns deprecation status.

## Validation checklist
- [x] Targeted lint passes for changed auth/UI/session files.
- [x] `npm run build` passes.
- [x] Manual API: login with fresh code returns token directly and activates access.
- [x] Manual API: DB activation window equals `60 days` in ms.
- [x] Manual API: second login invalidates first token on host-protected route.
- [x] Manual API: `/api/auth/host/activate` returns deprecation (`410`).

## Validation Evidence (2026-03-01)
1. PRD updated to remove host password setup requirement and define direct code-only login flow.
2. Login route contract updated:
   - `POST /api/auth/host/login` now accepts `{ username }` only.
   - First successful login activates code if needed and sets 60-day expiry window.
3. Activation route deprecated:
   - `POST /api/auth/host/activate` now returns `410 HOST_ACTIVATE_DEPRECATED`.
4. Host login UI updated:
   - `/host/login` now captures code only (no password field, no mode switch).
5. Session enforcement retained:
   - second login rotates `sessionId`;
   - stale token rejected with `HOST_SESSION_REVOKED` on host-protected routes.
6. Script/docs updates:
   - `scripts/smoke-live.sh` now logs in using code-only payload.
   - `scripts/load-rooms-100.mjs` now accepts host credentials as `{ username }`.
   - README env examples and flow text updated to code-only.
7. Validation commands:
   - targeted lint command on changed TS files passed (markdown/shell ignore warnings only) ✅
   - `npm run build` ✅
8. Manual local API validation (`next dev` at `127.0.0.1:4016`):
   - login #1 with fresh code succeeded (`200`) and returned token ✅
   - login #2 with same code succeeded (`200`) and rotated session ✅
   - stale token create-room returned `401 HOST_SESSION_REVOKED` ✅
   - latest token create-room returned `201` ✅
   - `/api/auth/host/activate` returned `410 HOST_ACTIVATE_DEPRECATED` ✅
9. D1 window check:
   - query `access_expires_at - activated_at` returned `5184000000` ms (`60 days`) ✅

## Rollback plan
1. Restore T-0037 activation+password flow in login UI/API.
2. Re-enable `/api/auth/host/activate` functional path.
3. Restore password requirement in fallback auth and scripts/docs.

## Notes/risks
1. Code-only login increases sensitivity of leaked codes; operational handling of code inventory remains critical.
2. Existing non-null `password_hash` stays as compatibility field but no longer user-facing.
