# Production readiness ledger

Last updated: 2026-08-13. Release candidate: 0.3.0.

Statuses use `pass`, `conditional pass`, `fail`, `not tested`, and `blocked`. Local evidence never substitutes for a signed-in Chrome gate.

| Gate | Status | Current evidence | Strongest remaining limitation | Next action |
|---|---|---|---|---|
| Structural and release integrity | conditional pass | MV3 manifest, narrow permissions, deterministic icon/package generators, syntax checks, version-sync and PNG validation tests | Final archive must be rebuilt after live-evidence documentation changes | Package after the final live run and verify checksum/archive listing |
| Stack and item management | conditional pass | Core and DOM tests cover one-paste/one-chain, uninterrupted pastes, FIFO order, active-boundary moves/insertion, locking, migration, duplication, and selected inspection | Exact A/B/C order has not yet been rerun in signed-in Chrome on 0.3.0 | Run A1→A2→C1→C2→B1 live |
| Submission correctness | conditional pass | DOM tests prove native input events, one Build click, durable awaiting state before click, stale-turn rejection, manual Resume, and selected-scope pinning | Current source has not yet been reloaded into Chrome | Reload and observe real Build/Send transitions |
| Completion, retry, timeout recovery | conditional pass | State-machine and DOM fixtures prove settle, scoped newest-turn Retry, retry exhaustion, and distinct timeouts | A fresh external service failure is not safely inducible on demand | Retain fixture evidence and observe any naturally occurring failure live |
| Persistence and concurrency | conditional pass | Migration, start-to-editor recovery, stale-runtime cleanup, storage-failure fail-closed behavior, serialized leases, pending-lease retention, non-owner control guards, same-app explicit recovery, wrong-app rejection, and two-content-instance contention tests pass | Browser/service-worker restart has not yet been exercised on 0.3.0 | Reload during a disposable live run and verify safe ownership |
| Real signed-in Chrome acceptance | not tested | Earlier 0.1.1 single-chain Build/continuation/ZIP evidence remains host-selector evidence | It is not evidence for the exact 0.3.0 source | Reload 0.3.0 and complete the live checklist |
| Security, privacy, accessibility | conditional pass | No remote code or unsafe HTML; narrow permissions; zero production dependency vulnerabilities; generated icons; labeled dialog, tabs, controls, and visible focus; permission-free diagnostics omit prompt text, labels, names, source, IDs, and history messages | Live console/CSP and keyboard behavior remain to be checked | Inspect console and operate panel in Chrome |
| Regression reliability | pass | Current source passes 40/40, including exact A/B/C order, redacted diagnostics, app-bound recovery, non-owner guards, hidden controls, blocking dialogs, large packs, lease expiry, tab-close release, synchronization, and stale-write rejection; an earlier candidate also passed four repeat runs with zero failures; production dependency audit reports zero vulnerabilities | Any later runtime change invalidates this pass | Re-run if live acceptance requires a code repair |
| Documentation and operability | conditional pass | README, selector map, comparison, live record, readiness ledger, and release checklist exist | Live record and final checksum are pending | Update after signed-in acceptance |

## Current release-blocking evidence gap

The source is not production-complete until the unpacked 0.3.0 build is the version actually running in Chrome and the signed-in A/B/C stack, inspection independence, reload recovery, console safety, and current ZIP menu all pass. If any code changes after that run, affected live gates must be repeated.
