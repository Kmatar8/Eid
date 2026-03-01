# T-0050: Haraj Image WebP Optimization Pipeline

- Status: done
- Milestone: M4
- PRD Reference: 6.1, 8.6, 15

## Objective
Add a repeatable pipeline to optimize Haraj product images into WebP and make runtime prefer WebP assets when available.

## Scope
### In
1. Add script to convert `public/images/haraj/*.{jpg,jpeg,png}` to `.webp`.
2. Keep source images while generating optimized `.webp` variants.
3. Update Haraj CSV sync resolver to prefer `.webp` when multiple files share same basename.
4. Add npm scripts for one-command optimization + catalog sync.
5. Regenerate Haraj bank from current assets.

### Out
1. Replacing or deleting original source images.
2. CDN-level image transformation.
3. Changes to Haraj gameplay logic.

## Dependencies
1. `scripts/sync-haraj-products-from-csv.mjs`
2. `public/images/haraj/`
3. `lib/server/haraj-bank.ts`
4. `package.json`

## API / Contracts Impacted
1. No API/event contract changes.

## Data Model Impact (D1/DO/R2)
1. D1: no changes.
2. DO: no changes.
3. R2: no changes.

## Implementation plan
1. Add `sharp`-based WebP conversion script for Haraj asset folder.
2. Add npm commands for conversion and conversion+sync workflow.
3. Update CSV sync image preference order to prioritize `.webp`.
4. Run conversion and regenerate product bank.
5. Validate with lint/typecheck/build.

## Acceptance criteria
1. Running one command generates `.webp` versions for Haraj assets.
2. Regenerated Haraj product bank uses `.webp` URLs when available.
3. Project compiles/builds successfully with updated assets.

## Validation checklist
- [x] WebP conversion script runs successfully.
- [x] Haraj bank points to WebP assets after sync.
- [x] Lint/typecheck/build pass.

## Validation evidence (2026-03-01)
1. Conversion pipeline:
   - `npm run assets:haraj:webp` ✅ (generated `.webp` for all current Haraj images)
2. Conversion + catalog sync:
   - `npm run assets:haraj:sync` ✅
   - `lib/server/haraj-bank.ts` now points to `/images/haraj/*.webp` for all products.
3. Runtime/tooling checks:
   - `npx eslint scripts/optimize-haraj-images.mjs scripts/sync-haraj-products-from-csv.mjs app/host/page.tsx lib/server/haraj-bank.ts` ✅ (warnings only, no errors)
   - `npx tsc --noEmit` ✅
   - `npm run build` ✅

## Rollback plan
1. Remove optimizer script and npm commands.
2. Revert resolver preference order.
3. Re-sync Haraj catalog to original asset extensions.

## Notes/risks
1. `sharp` introduces native dependency install cost.
2. WebP generation quality settings may need tuning per asset set.
