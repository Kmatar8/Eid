# T-0053: Fireworks Performance Hardening and Visibility Safety

- Status: done
- Milestone: M5
- PRD Reference: 3, 6.1.7, 8.6.1.13

## Objective
Prevent fireworks animation overload during tab switches and reduce render pressure while preserving celebratory visuals in host/landing surfaces.

## Scope
### In
1. Pause fireworks launch/update loops when document is hidden and resume cleanly on visibility return.
2. Add hard caps for active fireworks and particles, dropping oldest entries when limits are exceeded.
3. Reduce default particle burst size.
4. Remove duplicate fireworks-layer usage where both base and demo layers are rendered together.
5. Cap canvas DPR to reduce pixel fill cost.
6. Respect reduced-motion and auto-throttle/disable on weak devices.

### Out
1. Gameplay scoring/state changes.
2. Confetti behavior tied to scoring events.
3. New visual redesign of fireworks styles.

## Dependencies
1. `components/ui/fireworks.tsx`
2. Fireworks host/landing consumers in `app/page.tsx`, `app/host/page.tsx`, `app/host/login/page.tsx`, `app/eid-celebration/page.tsx`

## Implementation plan (step-by-step)
1. Introduce runtime performance guards and loop controls in `FireworksBackground`.
2. Add visibility lifecycle handling to stop scheduling/updating while hidden.
3. Add bounded arrays for fireworks and explosion particles.
4. Lower per-explosion particle generation range.
5. Remove duplicate `FireworksBackgroundDemo` overlays from affected pages.
6. Validate lint/build and record evidence.

## Acceptance criteria
1. Returning to a hidden tab does not trigger a burst backlog of fireworks.
2. Firework/particle collections remain bounded by configured runtime caps.
3. Fireworks render with reduced default particle density.
4. Affected pages no longer render both base and demo fireworks layers together.
5. Canvas rendering uses capped DPR (not full device DPR on very high-density screens).
6. `prefers-reduced-motion: reduce` disables auto fireworks loop; weak devices use reduced load.

## Validation checklist
- [x] Visibility pause/resume implemented and wired.
- [x] Runtime caps added for fireworks/particles.
- [x] Particle burst default reduced.
- [x] Duplicate fireworks demo layers removed from affected pages.
- [x] DPR cap implemented.
- [x] Reduced-motion and weak-device handling implemented.
- [x] `npm run lint` passes for touched files.
- [x] `npm run build` passes.

## Validation Evidence (2026-03-01)
1. `components/ui/fireworks.tsx` now includes:
   - `visibilitychange` pause/resume lifecycle
   - bounded fireworks/particle buffers with oldest-drop trimming
   - reduced particle burst range (`24-70` on normal devices, lower on weak devices)
   - DPR cap (`1.5`)
   - reduced-motion and weak-device runtime guards/throttling
2. Duplicate demo-layer usage removed from:
   - `app/page.tsx`
   - `app/host/page.tsx`
   - `app/host/login/page.tsx`
   - `app/eid-celebration/page.tsx`
3. Validation commands:
   - `npm run lint -- components/ui/fireworks.tsx app/page.tsx app/host/page.tsx app/host/login/page.tsx app/eid-celebration/page.tsx` ✅ (warnings only, no errors)
   - `npm run build` ✅

## Rollback plan
1. Revert changes in `components/ui/fireworks.tsx`.
2. Restore removed demo-layer imports/usages in affected pages.
3. Re-run build to verify previous behavior is restored.

## Notes/risks
1. Lowered effect density may be perceived as less dramatic on high-end devices.
2. Device capability heuristics (`hardwareConcurrency`/`deviceMemory`) are best-effort and browser-dependent.
