# T-0050: WhatsApp Link Preview OG Image

- Status: done
- Milestone: M1
- PRD Reference: 6.1, 14

## Objective
Ensure shared links (especially WhatsApp) show the intended brand preview image and title instead of default framework fallback assets.

## Scope
### In
1. Add explicit Open Graph metadata to root layout.
2. Add explicit Twitter card metadata aligned with Open Graph.
3. Set metadata base URL for absolute image resolution in social crawlers.

### Out
1. Landing page UI redesign.
2. Favicon changes.
3. Chatbot or gameplay logic.

## Dependencies
1. Global metadata in `app/layout.tsx`.
2. Existing landing hero image asset under `public/images/`.

## Implementation plan (step-by-step)
1. Add `metadataBase` using production domain fallback.
2. Configure `openGraph` fields with `summary_large_image`-compatible image.
3. Configure matching `twitter` metadata fields.
4. Validate build compiles metadata config.

## Acceptance criteria
1. Page response includes `og:title`, `og:description`, and `og:image` meta tags.
2. Page response includes matching Twitter large-image tags.
3. `og:image` resolves to branded image URL (not Next.js default assets).

## Validation checklist
- [x] Root metadata updated with Open Graph fields.
- [x] Root metadata updated with Twitter fields.
- [x] Build passes (`npm run build`).

## Validation Evidence (2026-03-01)
1. Updated `app/layout.tsx` metadata:
   - added `metadataBase`
   - added `openGraph` (title/description/siteName/images)
   - added `twitter` card metadata
2. Build validation:
   - `npm run build` ✅

## Rollback plan
1. Revert metadata additions in `app/layout.tsx`.
2. Keep existing title/description/icons unchanged.

## Notes/risks
1. WhatsApp caches link previews; existing shared URLs may need cache refresh/re-share before new image appears.
