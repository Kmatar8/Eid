# T-0076: Jeopardy Feedback Sync + State Clarity

- Status: done
- Milestone: M5
- PRD Reference: 3.3, 6.1, 6.2, 8.2, 9, 14.1

## Objective
Fix Jeopardy host/controller UI desynchronization where a stale snapshot can overwrite a newer one and keep the host feedback stuck on the first wrong-answer penalty (for example `-20`) after the steal responder answers correctly.

## Scope
### In
1. Add monotonic room-snapshot application logic on host and controller so older snapshots cannot overwrite newer state.
2. Apply that logic across poll, SSE stream, and action-ack update paths.
3. Improve trivia status/reveal messaging where needed so viewers can clearly understand who is answering and what the latest result is.

### Out
1. Trivia scoring-rule changes.
2. Turn-selection/randomization algorithm changes.
3. Timeout-policy value changes.

## Dependencies
1. `PRD.md`
2. `app/host/page.tsx`
3. `app/controller/[roomId]/page-client.tsx`
4. `lib/server/types.ts`

## API / Contract Impact
1. No new API routes.
2. No new action/event types.
3. Existing room snapshot contract remains unchanged; client-side ordering semantics are hardened.

## Data Model Impact
1. D1: no schema change.
2. Durable Object/runtime: no persistence-model change.
3. R2: no change.

## Implementation Plan
1. Add host helper to apply room snapshots only when they are not older than current (`version`/`updatedAt` aware, room-id aware).
2. Route all host snapshot writes (bootstrap, poll, stream, action acks) through that helper.
3. Add equivalent helper on controller and route hydrate/poll/stream/action-ack paths through it.
4. Refine trivia reveal/waiting copy to explicitly attribute current responder/result for clarity.
5. Run scoped lint/typecheck/build and record evidence.

## Acceptance Criteria
1. In a primary-wrong then steal-correct Jeopardy flow, host feedback advances to the final correct result and does not remain stuck on the initial negative score delta.
2. Controller view consistently reflects current responder ownership and final reveal result without stale regression.
3. Older room snapshots cannot replace newer snapshots on host/controller.
4. `eslint`, `tsc --noEmit`, and `npm run build` pass for affected scope.

## Validation Checklist
- [x] Host monotonic snapshot application implemented.
- [x] Controller monotonic snapshot application implemented.
- [x] Jeopardy responder/result messaging clarity updated.
- [x] Lint/typecheck/build validation captured.

## Validation Evidence
1. Host snapshot ingestion paths in [app/host/page.tsx](/Users/Khaled/Desktop/Dev/Hroof/app/host/page.tsx) now route through `applyIncomingRoomSnapshot(...)`, which rejects older room versions/older timestamps and prevents stale poll/SSE/ack payloads from overriding newer state.
2. Controller snapshot ingestion paths in [app/controller/[roomId]/page-client.tsx](/Users/Khaled/Desktop/Dev/Hroof/app/controller/[roomId]/page-client.tsx) now use the same monotonic guard logic.
3. Controller reveal-phase copy now explicitly names responder + team + signed points, improving clarity for all non-answering viewers.
4. Validation commands:
   - `npx eslint app/host/page.tsx 'app/controller/[roomId]/page-client.tsx'` ✅ (existing `no-img-element` warnings only in host page)
   - `npx tsc --noEmit` ✅
   - `npm run build` ✅

## Rollback Plan
1. Revert host/controller snapshot-gating helper usage.
2. Revert related trivia status/reveal copy adjustments.
3. Re-run validation to confirm baseline behavior restoration.

## Notes / Risks
1. If backend emits equal-version but non-identical payloads, strict client ordering can hide late non-authoritative fields; mitigation is using `version` with `updatedAt` tie-break and room-id guard.
2. This change prioritizes state monotonicity and may reduce UI churn from transient stale responses.
