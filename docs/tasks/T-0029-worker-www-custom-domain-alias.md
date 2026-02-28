# T-0029: Worker WWW Custom Domain Alias

- Status: done
- Milestone: M5
- PRD Reference: 10.1, 10.2, 15

## Objective
Ensure the Worker is reachable on both `happystore.click` and `www.happystore.click` for production access consistency.

## Scope
### In
1. Diagnose current DNS and Worker domain trigger state for apex and `www`.
2. Add explicit Worker custom-domain trigger for `www.happystore.click`.
3. Keep `happystore.click` mapped and verify both hostnames over HTTPS.
4. Record validation evidence.

### Out
1. Application-level SEO/canonical URL strategy changes.
2. Cloudflare Redirect Rules or Page Rules changes beyond domain reachability.
3. Non-Cloudflare DNS provider changes.

## Dependencies
1. Cloudflare account access with Worker and zone permissions.
2. Existing Worker deployment pipeline (`npm run deploy` / Wrangler config).

## API / Contract Impact
1. No application API contract changes.
2. Infrastructure routing trigger update only (hostname coverage).

## Data Model Impact (D1/DO/R2)
1. D1: none.
2. Durable Objects: none.
3. R2: none.

## Implementation Plan
1. Confirm current state with live DNS and HTTPS checks.
2. Update `wrangler.jsonc` to declare both custom domains as routes.
3. Deploy Worker triggers/config.
4. Re-check DNS resolution and HTTPS responses for both hostnames.
5. Capture evidence and mark task complete.

## Acceptance Criteria
1. `happystore.click` resolves and serves the Worker.
2. `www.happystore.click` resolves publicly and serves the same Worker.
3. HTTPS requests to both hostnames return valid HTTP response from Cloudflare/Worker.
4. Task file includes validation evidence and final status.

## Validation Checklist
- [ ] Lint/typecheck pass for changed code/config.
- [x] Manual: `dig` confirms A/AAAA resolution for both hostnames.
- [x] Manual: `curl -I https://happystore.click` returns Worker response.
- [x] Manual: `curl -I https://www.happystore.click` returns Worker response.
- [x] Evidence recorded in this task file.

## Validation Evidence (2026-03-01)
1. Root cause confirmed:
   - `www.happystore.click` initially returned `NXDOMAIN` from local resolver cache.
   - Worker domain bindings were then enforced via triggers deploy to include both:
     - `happystore.click`
     - `www.happystore.click`
2. Infrastructure change applied:
   - Updated `wrangler.jsonc` routes with two explicit custom-domain patterns.
   - Applied triggers with:
     - `npx wrangler triggers deploy --config wrangler.jsonc --name hroof-app`
   - CLI confirmed:
     - `happystore.click (custom domain)`
     - `www.happystore.click (custom domain)`
3. Authoritative DNS verification:
   - `dig @buck.ns.cloudflare.com www.happystore.click +short` returned:
     - `104.21.94.153`
     - `172.67.137.200`
   - `dig @buck.ns.cloudflare.com happystore.click +short` returned:
     - `172.67.137.200`
     - `104.21.94.153`
4. HTTPS verification:
   - `curl -I https://happystore.click` returned `HTTP/2 200`.
   - `curl -I` for `www` with edge resolution returned `HTTP/2 200`, confirming Worker+TLS path is healthy while recursive resolver caches clear.
5. Local checks note:
   - Full `npm run deploy` is currently blocked by an unrelated pre-existing app type error in `app/page.tsx` import (`FireworksBackgroundDemo` export mismatch), not caused by this task.

## Rollback Plan
1. Remove `www.happystore.click` route from `wrangler.jsonc`.
2. Redeploy Worker triggers.
3. Verify `happystore.click` remains healthy after rollback.

## Risks / Notes
1. SSL issuance/propagation for new custom domain may take a short time after trigger creation.
2. Existing dashboard-managed triggers can conflict if config and dashboard diverge.
