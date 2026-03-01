# T-0049: Haraj Image Asset Resolution and Sizing Hardening

- Status: done
- Milestone: M4
- PRD Reference: 6.1, 8.6, 15

## Objective
Harden Haraj image handling for mixed aspect ratios and mixed filename extensions to avoid broken images and improve host board display quality.

## Scope
### In
1. Enhance CSV sync to resolve image filenames against `public/images/haraj` (including `.jpg`/`.jpeg` differences).
2. Keep warnings when an image file cannot be resolved.
3. Update host Haraj image rendering to avoid aggressive crop for mixed dimensions.

### Out
1. Full image optimization pipeline (batch recompress/resize job).
2. CDN/media-service integration.
3. Controller gameplay logic changes.

## Dependencies
1. `scripts/sync-haraj-products-from-csv.mjs`
2. `lib/server/haraj-bank.ts`
3. `app/host/page.tsx`
4. `public/images/haraj/`

## API / Contracts Impacted
1. No API contract changes.

## Data Model Impact (D1/DO/R2)
1. D1: no changes.
2. DO: no changes.
3. R2: no changes.

## Implementation plan
1. Add image-file resolution logic to CSV sync script.
2. Re-sync Haraj product bank from CSV.
3. Update host collecting/reveal image rendering classes for mixed dimensions.
4. Run lint/typecheck/build and record evidence.

## Acceptance criteria
1. CSV sync maps products to existing files in `public/images/haraj` when extension differs.
2. Haraj host image panels preserve full product visibility better for tall/wide images.
3. Project builds successfully after changes.

## Validation checklist
- [x] Sync script runs and resolves image filenames.
- [x] Host page compiles with updated image rendering.
- [x] Lint/typecheck/build pass.

## Validation evidence (2026-03-01)
1. Sync with image-resolution fallback:
   - `npm run sync:haraj:csv` ✅
   - Auto-resolved extension mismatches (`.jpg` -> `.jpeg`) for current asset set.
2. Host UI sizing hardening:
   - Haraj collecting and reveal image containers now use centered `object-contain` for mixed aspect ratios.
3. Runtime checks:
   - `npx eslint scripts/sync-haraj-products-from-csv.mjs app/host/page.tsx lib/server/haraj-bank.ts` ✅ (warnings only, no errors)
   - `npx tsc --noEmit` ✅
   - `npm run build` ✅

## Rollback plan
1. Revert sync script filename-resolution logic.
2. Revert host image class changes.
3. Re-run CSV sync to restore previous bank output.

## Notes/risks
1. Filename typo mismatches beyond extension still require CSV/file correction.
