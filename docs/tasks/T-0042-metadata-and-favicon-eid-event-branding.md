# T-0042: Metadata and Favicon Branding to فعالية العيد

- Status: done
- Milestone: M1
- PRD Reference: 6.1, 14

## Objective
Update global site branding from `حروف` to `فعالية العيد` in metadata and browser tab/favicon surfaces.

## Scope
### In
1. Update app metadata title/branding text to `فعالية العيد`.
2. Add a new custom favicon icon asset.
3. Wire metadata/manifest icon references to the new favicon.

### Out
1. Gameplay or auth logic changes.
2. Landing content/copy changes outside metadata/manifest.

## Dependencies
1. Global app metadata in `app/layout.tsx`.
2. Web manifest in `public/manifest.json`.

## Implementation plan (step-by-step)
1. Update `app/layout.tsx` metadata title/description/apple title to new branding.
2. Add new favicon SVG in `public/`.
3. Update metadata icon references and `public/manifest.json` icon entry.
4. Validate with production build.

## Acceptance criteria
1. Browser tab title branding reflects `فعالية العيد`.
2. Favicon is served from the new icon asset.
3. Manifest uses the updated icon reference.

## Validation checklist
- [x] Metadata updated in layout.
- [x] New favicon asset added.
- [x] Manifest icon reference updated.
- [x] `npm run build` passes.

## Validation Evidence (2026-03-01)
1. Updated metadata branding in `app/layout.tsx`:
   - title -> `فعالية العيد`
   - apple web app title -> `فعالية العيد`
   - metadata icon references now point to `/eid-favicon.svg`.
2. Added custom favicon asset:
   - `public/eid-favicon.svg` (crescent + star themed icon).
3. Updated PWA manifest:
   - `public/manifest.json` name and short_name -> `فعالية العيد`
   - icon entry switched to `/eid-favicon.svg`.
4. Validation command:
   - `npm run build` ✅

## Rollback plan
1. Revert `app/layout.tsx` metadata strings/icons.
2. Revert `public/manifest.json` icon reference.
3. Remove new favicon asset.

## Notes/risks
1. Browser favicon caching may delay visible updates until hard refresh.
