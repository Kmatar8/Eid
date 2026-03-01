# T-0048: Haraj Products CSV Sync and Image Path Standardization

- Status: done
- Milestone: M4
- PRD Reference: 8.6, 12, 15

## Objective
Replace hardcoded dummy Haraj products with CSV-driven real products and define a stable image folder path for host/controller runtime.

## Scope
### In
1. Add a sync script that converts `haraj.csv` into `lib/server/haraj-bank.ts`.
2. Use CSV fields (`Product name`, `Price`, `image`) to generate Haraj product entries.
3. Standardize image URL mapping to `/images/haraj/<filename>`.
4. Create the image directory and document where JPGs must be placed.
5. Replace dummy product bank with CSV-generated content.

### Out
1. Admin CMS/UI for Haraj product management.
2. Image optimization pipeline changes.
3. Game scoring/phase behavior changes.

## Dependencies
1. `haraj.csv`
2. `scripts/`
3. `lib/server/haraj-bank.ts`
4. `public/images/haraj/`

## API / Contracts Impacted
1. No API/event contract changes.
2. Runtime Haraj catalog content changes only.

## Data Model Impact (D1/DO/R2)
1. D1: no schema changes.
2. Durable Object: no shape changes; products source is updated.
3. R2: no changes.

## Implementation plan
1. Create CSV sync script for Haraj products with robust CSV parsing and validation.
2. Add npm script command for repeatable sync runs.
3. Generate `lib/server/haraj-bank.ts` from `haraj.csv`.
4. Create `public/images/haraj/` and document expected image filenames.
5. Run lint/typecheck/build.
6. Record validation evidence and mark task done.

## Acceptance criteria
1. `HARAJ_PRODUCT_BANK` is sourced from CSV data, not dummy catalog.
2. Each generated product maps image URL to `/images/haraj/<csv-image-name>`.
3. Team can re-run one command to refresh product bank after CSV updates.
4. Runtime build succeeds after catalog update.

## Validation checklist
- [x] CSV sync script runs successfully.
- [x] Generated Haraj bank contains all valid CSV rows.
- [x] Lint/typecheck/build pass.

## Validation evidence (2026-03-01)
1. CSV sync:
   - `npm run sync:haraj:csv` ✅
   - Generated `lib/server/haraj-bank.ts` with `12` products from `haraj.csv`.
2. Image path standard:
   - All generated `imageUrl` values now use `/images/haraj/<filename>`.
   - Added image placement guide in `public/images/haraj/README.md`.
3. Runtime checks:
   - `npx eslint scripts/sync-haraj-products-from-csv.mjs lib/server/haraj-bank.ts` ✅
   - `npx tsc --noEmit` ✅
   - `npm run build` ✅

## Rollback plan
1. Revert generated `lib/server/haraj-bank.ts` to previous static catalog.
2. Remove sync script and npm command.
3. Revert docs/task updates.

## Notes/risks
1. Invalid CSV rows are skipped by sync with explicit warnings.
2. Missing image files in `public/images/haraj/` will render broken image links until assets are added.
