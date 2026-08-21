# Production readiness ledger

Last updated: 2026-08-21. Release candidate: 0.4.0.

Statuses use `pass`, `conditional pass`, `fail`, `not tested`, and `blocked`. Local evidence never substitutes for a signed-in Chrome gate.

| Gate | Status | Current evidence | Strongest remaining limitation | Next action |
|---|---|---|---|---|
| Structural and release integrity | pass locally | MV3 manifest, narrow permissions, schema-v3 state, deterministic package source list, syntax checks, version-sync and PNG validation; `dist/ai-studio-queue-pilot-0.4.0.zip` and its checksum sidecar are generated | Signed-in Chrome still needs the final unpacked build | Complete the live acceptance pack |
| Build workflow choice | pass locally | Visible Draft Plan/Full Wizard chooser, natural-intake actions, preserved description, and legacy form path are covered | Signed-in interaction has not yet been repeated on the installed unpacked build | Exercise both workflows live |
| Draft Plan intake | pass locally | Pure `AISQPlan` API, provenance, v2→v3 migration, deterministic ranking/cap, dependency review, dismissal invalidation, and generator effects are covered | Signed-in interaction has not yet been repeated on the installed unpacked build | Exercise description, template, JSON, and ChatGPT paths live |
| Atomic queue and run approval | pass locally | `APPROVE_PLAN_IMPORT` is commit-ID idempotent; Add to Queue and Run integration flows assert exactly-once chain creation | Real host click/reload behavior remains external | Run both approval buttons in a disposable signed-in app |
| Stack and item management | pass locally | Core and DOM tests cover uninterrupted pastes, FIFO order, active-boundary moves/insertion, locking, migration, duplication, and selected inspection | Exact A/B/C order has not yet been rerun in signed-in Chrome on 0.4.0 | Run A1→A2→C1→C2→B1 live |
| Submission correctness | conditional pass | DOM tests prove native input events, one Build click, durable awaiting state before click, stale-turn rejection, manual Resume, and selected-scope pinning | Current 0.4.0 source still needs a fresh Chrome reload | Reload and observe real Build/Send transitions |
| Completion, retry, and timeout recovery | conditional pass | State-machine and DOM fixtures prove settle, scoped newest-turn Retry, retry exhaustion, and distinct timeouts | A fresh external service failure is not safely inducible on demand | Retain fixture evidence and observe any naturally occurring failure live |
| Persistence and concurrency | pass locally | Schema migration, Draft Plan rehydration, stale-runtime cleanup, storage-failure fail-closed behavior, serialized leases, move fencing, tab-close cleanup, and cross-tab guards pass | Browser/service-worker restart has not yet been exercised on 0.4.0 | Reload during a disposable live run and verify safe ownership |
| Security, privacy, and accessibility | pass locally | No remote code or unsafe HTML; no new permissions/dependencies; local-only events; labeled controls, visible focus, semantic Draft Plan fields, and narrow-layout CSS are tested | Live console/CSP and keyboard behavior remain to be checked | Inspect console and operate the panel in Chrome |
| Regression reliability | pass | `npm run verify` passes all 98 tests, including manifest-order integration, both workflow paths, Draft Plan flows, lease fencing, migration, reinjection, and queue logic | Any later runtime change invalidates this pass | Re-run after any live-driven code repair |
| Real signed-in Chrome acceptance | not tested | The current source has local evidence and a v0.4.0 acceptance pack | The unpacked 0.4.0 build has not been freshly reloaded and observed in the signed-in profile | Complete the live acceptance pack and record evidence |
| Documentation and operability | conditional pass | README, selector map, comparison, Draft Plan decision log, live record, readiness ledger, release checklist, archive, and checksum sidecar are updated | Live observations are pending | Append signed-in evidence |

## Release-blocking evidence gap

The source is locally release-ready, but the v0.4.0 release is not fully accepted until the unpacked build is the version actually running in signed-in Chrome and the Draft Plan, exact-once approval, A/B/C stack, inspection independence, reload recovery, console safety, diagnostics, and current ZIP menu all pass. If any code changes after that run, affected live gates must be repeated.
