# Decision log

## 2026-08-21 — Make the decision graph the planning source of truth

- Evidence: a flat review form cannot show progress, locked dependencies, downstream invalidation, or bounded custom branches; keeping the Full Wizard separate also creates conflicting plan state.
- Decision: persist versioned decisions and provenance, derive a stable `PlanGraph`, and render Draft Plan, Concept Map, Full Wizard, and generator output as projections of that graph.
- Downstream effect: map progress counts only confirmed/dismissed decisions, Full Wizard uses the atomic plan approval command, and graph layout/defaults remain computed rather than persisted.

## 2026-08-21 — Separate custom intent from generator profiles

- Evidence: arbitrary app-size strings previously became scale index zero and could silently omit security, testing, and deployment work.
- Decision: preserve `archetypeDetail`/`scaleDetail` as user intent while requiring canonical `archetype`/`scale` decisions. Unknown legacy scale fails closed to Production until reviewed.
- Downstream effect: custom wording remains client-visible, canonical profiles control deterministic generation, every custom choice gets a bounded local path, and an imported fallback remains explicitly unresolved until the user maps it to a compatible profile. When several custom rules match, safety-critical questions win the three-question interview budget and every capped path remains visible with its conservative assumption included in generated context.

## 2026-08-21 — Keep remote custom-branch generation disabled in v0.4

- Evidence: remote planners add privacy, prompt-injection, latency, recovery, and unbounded-question risks that the extension does not yet have authority or permissions to accept.
- Decision: ship deterministic registered custom branches plus a validated proposal-only provider contract; `remoteEnabled` remains false.
- Reversal condition: explicit user consent, privacy disclosure, bounded schema validation, timeout/retry recovery, and evidence that generated nodes cannot directly modify generator stages or execute commands.

## 2026-08-21 — Make the Draft Plan the intake source of truth

- Evidence: a long mandatory wizard delays the first useful review and mixes inferred values with user intent.
- Decision: persist only versioned intent, decisions, provenance, active question, and dismissals in `ui.planDraft`; compute defaults, confidence, dependencies, stages, and generated answers.
- Downstream effect: description, template, JSON, and ChatGPT paths converge on one deterministic Draft Plan before queueing.

## 2026-08-21 — Keep Draft Plan approval atomic and local

- Evidence: approval can be retried by a user or a reinjected runtime, so a visual success message is not enough to prevent duplicate chains.
- Decision: require a commit ID and reviewed-draft fingerprint in `APPROVE_PLAN_IMPORT`, revalidate graph eligibility inside the command, regenerate the expected chain and reject mismatched prompt content, make the command idempotent, and record approval/queue events in the existing local event log.
- Tradeoff: no remote planner or analytics is introduced; consequential uncertainty remains visible and queueing fails closed only when no safe value exists.

## 2026-08-13 — Keep paste intake on Build

- Evidence: the prior implementation switched to Prompts after import, so a real second paste required navigating back even though a stale DOM reference made the fixture appear uninterrupted.
- Decision: clear the intake but remain on Build and update the live stack meter after every paste.
- Reversal condition: a user-controlled setting may later opt into automatic review, but uninterrupted intake remains the default.

## 2026-08-13 — Enforce an active-chain execution boundary

- Evidence: a future chain could be moved or inserted before the active chain, after which forward-only traversal could skip it.
- Decision: while running, only positions strictly after the active chain may be reordered or receive new/duplicated chains.
- Downstream effect: rejected moves produce a visible diagnostic instead of silently changing intent.

## 2026-08-13 — Pin selected-only scope

- Evidence: selected-only traversal used `selectedChainId` on every advance, so inspecting another chain could redirect execution.
- Decision: persist `runner.scopeChainId` at start and use it until completion.
- Downstream effect: inspection and execution ownership are independent.

## 2026-08-13 — Serialize runner ownership in the service worker

- Evidence: content scripts independently evaluated timestamps, leaving a two-tab acquisition race.
- Decision: serialize acquire, heartbeat, release, expiry, and tab-close cleanup through a `chrome.storage.session` lease owned by the service worker.
- Reversal condition: replace only with an equally atomic coordinator that survives MV3 worker suspension.

## 2026-08-13 — Persist before irreversible host clicks

- Evidence: a crash between Build/Send and the next storage write could replay a prompt.
- Decision: persist the awaiting state and prompt ownership before Build, Send, or Retry. A storage failure pauses without clicking.
- Tradeoff: a crash after commit but before click can require manual recovery, favoring at-most-once automatic submission over silent duplication.

## 2026-08-13 — Reject causally stale tab writes

- Evidence: timestamp/revision ordering alone could let a disconnected stale tab overwrite a newer chain edit when both independently advanced from the same revision.
- Decision: each content runtime tracks its last persisted revision. If storage contains a causally newer revision at save time, keep that authoritative state, discard the stale mutation, and show a diagnostic asking the user to repeat the edit after synchronization.
- Tradeoff: a rare concurrent edit may need to be repeated, but current work is never silently reverted by a stale tab.

## 2026-08-13 — Bind pending recovery to an app, not merely a lease

- Evidence: releasing ownership while a prompt was pending could let another AI Studio tab resume or classify that prompt against a different app transcript; a non-owner tab could also globally pause the owner through synchronized state.
- Decision: retain and heartbeat the lease during a pending manual pause, persist the bound `/apps/<app-id>` path, guard pause/skip mutations by lease ownership, and require explicit same-app recovery after the original owner disappears.
- Tradeoff: recovery after a closed tab is deliberately interactive. Wrong-app or ambiguous recovery fails closed to protect at-most-once submission.
