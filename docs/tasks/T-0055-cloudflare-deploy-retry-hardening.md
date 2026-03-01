# T-0055: Cloudflare Deploy Retry Hardening

- Status: done
- Milestone: M5
- PRD Reference: 14, 15

## Objective
Harden Cloudflare deployment reliability against transient API gateway failures (`502`/malformed HTML response) without changing runtime app behavior.

## Scope
### In
1. Add a retry-capable Wrangler deploy wrapper script for CI use.
2. Update npm scripts to expose a dedicated retry deploy command.
3. Upgrade Wrangler to latest patch version used by CI.
4. Document recommended Cloudflare deploy command configuration.

### Out
1. Runtime code changes in host/controller/chat flows.
2. Cloudflare account/network-level incident mitigation.
3. Dependency vulnerability remediation unrelated to deploy failure.

## Dependencies
1. `package.json`
2. `package-lock.json`
3. `scripts/`
4. `README.md`

## API / Contracts Impacted
1. No API contract changes.

## Data Model Impact (D1/DO/R2)
1. D1: no change.
2. DO: no change.
3. R2: no change.

## Implementation plan
1. Add Node deploy wrapper to execute `wrangler deploy` with transient-error retries.
2. Add npm script for retry deploy command.
3. Upgrade `wrangler` dependency and regenerate lock file.
4. Update README with Cloudflare build/deploy command recommendation.
5. Validate with lint/typecheck/build and dry-run deploy wrapper invocation.

## Acceptance criteria
1. CI can use one command that retries transient Cloudflare deploy failures.
2. Wrapper retries only on transient deploy failure patterns and exits non-zero for hard failures.
3. Build/typecheck pass after dependency/script updates.

## Validation checklist
- [x] Retry deploy script executes and validates arguments.
- [x] Lint/typecheck/build pass.
- [x] README deploy command guidance updated.

## Validation evidence (2026-03-01)
1. Retry wrapper script:
   - Added `scripts/wrangler-deploy-with-retry.mjs`.
   - Dry-run invocation: `node scripts/wrangler-deploy-with-retry.mjs --help` ✅
2. Dependency/tooling update:
   - Upgraded Wrangler to `^4.69.0` and refreshed lock file.
3. Runtime checks:
   - `npx tsc --noEmit` ✅
   - `npm run build` ✅
4. Documentation:
   - Added Cloudflare CI retry deploy command guidance in `README.md`.

## Rollback plan
1. Remove retry wrapper script and npm script mapping.
2. Revert Wrangler version/lock changes.
3. Revert README deploy guidance.

## Notes/risks
1. Retries do not fix persistent account/API outages; they reduce transient failure impact.
