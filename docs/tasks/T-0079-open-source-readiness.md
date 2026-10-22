# T-0079 — Open source readiness

Status: in_progress
Milestone: M5 Reliability + Scale
PRD reference: platform reliability and host authentication; no product requirement changes.

## Objective
Prepare the project for public reuse under MIT.

## Scope
License, README, contribution guidance, generated credential ignore rules. No runtime or production database changes.

## Dependencies
Owner authorization received. Existing host credential exports must be revoked or confirmed inactive before publication. Historical credentials remain accessible in Git history.

## Implementation plan
1. Document the publication blocker.
2. Add MIT license and improve setup and architecture documentation.
3. Ignore future credential exports.
4. Verify remote file contents.

## Acceptance criteria
Documentation matches repository scripts; license permits commercial reuse; credential publication blocker is explicit.

## Validation checklist
Remote review of package scripts, Cloudflare bindings, authentication and code generation. Runtime checks are not run: documentation-only work performed through GitHub without a local checkout.

## Rollback plan
Revert the documentation commit. Do not rewrite history or revoke live codes without coordinating with the owner.

## Notes/risks
API/events/contracts and D1/DO/R2 schemas unchanged. Committed host credentials block safe publication. Asset ownership and historical secret review remain outstanding.
