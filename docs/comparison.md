# Deep comparison of the supplied automations

Five supplied text collections contain roughly 14,500 lines spanning the standalone download/access/retry/auto-fix helpers, PSB v1/v2/v2.1, mixed PSB v2.4, PSB v2.7, and the v2.8 pacing draft. They show useful product evolution, but no single supplied version matches the current AI Studio Apps UI or provides a complete, safe Chrome-extension lifecycle.

## What was worth preserving

| Idea from supplied code | Assessment | Queue Pilot result |
|---|---|---|
| Prompt archive, editable series/queue, and a persistent cursor | Correct product direction | Retained as local queues with per-item statuses and prompt-ID ownership. |
| A pending/commit model (v2.4+) | Essential for retry safety | Strengthened: pending is written before click and completion requires a newer assistant turn. |
| Fence-aware delimiter/header splitting (v2.1+) | Valuable | Retained and tested; extended for `Stage N`, `P001`/`R001`, and `Prompt N`. |
| Post-completion settle delay (v2.4+) | Valuable | Retained as a configurable settle window, tied to an explicit success signal. |
| Inter-prompt pacing (v2.8) | Valuable | Implemented as a persisted runner phase. No next prompt is inserted during pacing. |
| Auto-retry countdown | Useful when bounded | Retained with a retry budget, delay, last-turn scoping, and manual pause on exhaustion. |
| Allow access / Auto-fix helpers | Sometimes useful | Integrated as explicit opt-ins and single-click-per-control behavior; both default off. |
| Execution status and ETA-oriented UI (v2.7) | Helpful direction | A compact phase, host-state, count, baseline, and retry display is retained; speculative ETA was omitted until enough trustworthy observations exist. |

## Why the supplied versions fail or drift today

### 1. `.running` is no longer a valid completion oracle

PSB v2.1 through v2.8 classify the send button with `btn.classList.contains("running")` and treat the disappearance of that class as completion after a delay. The live editor’s current Send button does not expose that class during the observed run. Completion/failure now appears in assistant turns, for example `Running for …`, `Ran for …`, or `Canceled`, plus error callouts.

Consequence: an old runner can mistake idle/disabled transitions for success, advance early, or remain unable to recognize a real run.

Queue Pilot instead records `ms-code-assistant-chat .turn-container > .turn` count before submission. Only a newly added turn can run, fail, retry, or complete the pending item.

### 2. Re-enabled Send does not prove success

The early v1/v2 runner waits for Send to re-enable and then advances. In the live diagnostic, AI Studio created a turn, entered `Running`, then ended `Canceled` with “An internal error occurred.” Send becoming available after that failure cannot be treated as completion.

Queue Pilot requires explicit success text on the new turn and rejects the visible Retry/error state.

### 3. Retry scanning can target stale cards

Several versions scan every `button` and return the first exact `Retry`. AI Studio retains prior turns, so an older failure can remain in the document. That makes global-first matching unsafe.

Queue Pilot searches only within the newest assistant turn and updates the turn-count baseline before retrying.

### 4. Cut/restore exists because the old runner preloads too early

The retry and Auto-fix scripts snapshot the composer, clear it, click, and restore after 2.6 seconds. This tries to prevent the already-loaded next prompt from contaminating Retry. It adds races with Angular form state, user edits, rerenders, and navigation.

Queue Pilot removes the root cause: it never loads the next prompt before the current prompt has a stable successful turn and pacing has ended. Retry therefore clicks with an empty composer and needs no restoration timer.

### 5. Direct `textarea.value = …` can desynchronize Angular

Every supplied PSB generation assigns `.value` directly and emits generic events. Framework-controlled textareas can retain internal state that does not match the visible DOM value.

Queue Pilot calls the native `HTMLTextAreaElement.prototype.value` setter and dispatches bubbling `input` and `change` events, then waits for the actual Build/Send readiness signal.

### 6. Automatic blank-paragraph splitting changes user intent

Several versions split on paragraphs or a double blank line. Natural multi-paragraph build instructions therefore become multiple independent submissions. Numbered-list handling also splits short requirement lists too eagerly.

Queue Pilot never auto-splits on blank paragraphs. Numbered blocks require at least three substantial blocks; explicit strategies remain available when the author really wants that split.

### 7. Shared prefaces are lost

Header-based splitting in the supplied versions can produce a separate prefix chunk or leave later prompts without global rules.

Queue Pilot prepends text before the first recognized header to each header-based prompt, preserving shared constraints.

### 8. The v2.8 file is not a complete UI build

The v2.8 draft explicitly says `renderPromptsTab` and `renderRunTab` are placeholders that must be copied from v2.7. It contains useful pacing logic but is not a standalone final version.

Queue Pilot implements the entire Build/Prompts/Run/Settings surface in one extension release.

### 9. The download selector is obsolete

The standalone download helper expects `button[aria-label="Download app"]`. The live UI now exposes **Export options** in Code view, followed by **Download as .zip file — Standard project archive**. Generic download-icon matching is unsafe because Code view contains file-level download buttons.

Queue Pilot uses the current view/menu sequence and exact semantic item text.

### 10. Page `localStorage` is the wrong extension boundary

All PSB generations persist in AI Studio’s page-origin `localStorage`, mix versioned keys, and expose mutable debug state on `window`. Console reloads can also leave observers/timers from another version unless cleanup succeeds.

Queue Pilot runs once as an isolated-world MV3 content script and persists a schema-migrated state in `chrome.storage.local`. The service worker only toggles the panel; no broad background access is used.

### 11. Page-level UI construction is collision-prone

The supplied files inject global IDs/classes and some use `innerHTML` for modal content and tips. On a strict Trusted Types application this is a recurring source of errors, and page CSS can leak into the overlay.

Queue Pilot uses a shadow root and DOM construction only. There are no `innerHTML` assignments.

### 12. Start-page creation is missing

The supplied runners target only `ms-code-assistant-chat` in an existing editor. They cannot begin from `/apps?source=start`, where the live composer and Build control are different and app creation navigates to a new URL.

Queue Pilot handles both start and editor adapters while persisting the same pending prompt through navigation.

## Resulting acceptance contract

The extension is considered correct only if all of these hold:

1. MV3 scripts parse and automated unit tests pass.
2. Build/Prompts/Run/Settings render without Trusted Types violations.
3. Start-page Build and editor Send use visible, current controls.
4. A stale terminal card cannot advance a new prompt.
5. Retry remains owned by the same prompt and is bounded.
6. No prompt is preloaded during busy, retry, settle, or pacing.
7. Reload/navigation keeps recoverable state.
8. ZIP export uses Code → Export options → Download as `.zip`.

