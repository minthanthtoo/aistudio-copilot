# Live AI Studio Apps UI state map

Observed in the signed-in Chrome UI on 2026-08-03. Selectors are intentionally scoped and paired with semantic state checks.

| State or action | Current evidence | Queue Pilot behavior |
|---|---|---|
| Apps start composer | `textarea[placeholder="Describe an app and let Gemini do the rest"]` | Uses only a visible exact-placeholder textarea. |
| Start submission | `button.build-button`; empty state has `aria-disabled="true"` and `button-hidden` | Fills through the native textarea value setter, dispatches `input`/`change`, waits for readiness, then clicks. |
| Editor composer | `ms-code-assistant-chat textarea[placeholder="Make changes, add new features, ask for anything"]` | Prefers the scoped exact-placeholder selector, with a visible fallback. |
| Editor submission | `ms-code-assistant-chat button[aria-label="Send"]` | Treats native `disabled`, `aria-disabled="true"`, and `.disabled` as blocked. |
| Busy | Newest assistant header such as `Gemini 3.6 Flash Running for 1s`; turn body may say `Assembling`, `Thinking`, `Applying file changes`, or `Generating design previews…` | Holds the pending prompt and never loads the next item. |
| Success | Newest assistant header such as `Gemini 3.6 Flash Ran for 23s` | Requires a turn count greater than the pre-submit baseline, then a settle window. |
| Failure | Newest assistant header `Canceled`/`Failed`, `ms-chat-turn-error`, or `ms-error-callout` | Pauses or schedules a bounded retry. |
| Retry | Exact **Retry** button inside the newest assistant turn’s error callout | Never selects a Retry button from an older turn; the composer remains empty. |
| Guided/consent overlay | Visible dialog text such as Guided Tour, welcome, sign-in, or consent | Reports a blocked state rather than clicking unrelated UI. |
| Host submit preference | Settings → Submit prompt: `Cmd + Enter` or `Enter`; selected radio uses `.radio-dot.selected` | Leaves the preference unchanged because Queue Pilot clicks Build/Send. |
| Editor views | Exact **Preview** and **Code** buttons | ZIP flow switches to Code when needed. |
| ZIP menu | `button[aria-label="Export options"]` → menu item beginning `Download as .zip file` | Uses the current two-step export flow. |

## State machine

```text
ready -> submitting -> awaiting_start -> running -> settling -> pacing -> ready
                                  |          |
                                  +-> retry_wait -> awaiting_start
                                  +-> paused/error (budget or timeout)

no next queued prompt -> done
```

The `baselineTurnCount` invariant is central: terminal text in an older card is ignored. Completion is not inferred merely because Send becomes enabled or a CSS class disappears.

Before any Build, Send, or Retry click, Queue Pilot persists the awaiting state and prompt ownership. A storage failure therefore pauses before the host action; a crash after the commit is treated as an ambiguous awaiting submission rather than automatically clicking twice.

Runner ownership is also separate from inspection state. Selected-only execution pins `scopeChainId` when it starts, so selecting another chain cannot redirect the next prompt. A serialized service-worker lease stored in `chrome.storage.session` allows one tab to submit, uses bounded heartbeats and expiry, and releases on completion, a pause with no pending work, tab close, or runtime cleanup.

Pending work is additionally bound to the current `/apps/<app-id>` path. A manual pause retains its lease and heartbeat. A non-owner tab cannot pause or skip the active work; after the original tab closes or its lease expires, **Recover here** succeeds only in the same bound app. A different app is rejected before lease acquisition. A start-page `/apps` binding is promoted to the newly created app path by the owning tab after navigation; recovery of an ambiguous start-page submission requires explicit confirmation.

## DOM and Trusted Types

The extension UI is contained in an open shadow root. It is created with `createElement`, `textContent`, properties, and event listeners. It does not assign `innerHTML`, inject page-world scripts, or construct TrustedHTML. AI Studio input is updated through the native textarea setter so Angular receives an actual input event instead of a visually changed but stale form-control value.
