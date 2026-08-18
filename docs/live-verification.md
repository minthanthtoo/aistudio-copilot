# Signed-in live verification record

Live checks were performed in the user-authorized Chrome session against Google AI Studio Apps on 2026-08-03.

## Toolbar and injection

- Initial symptom: clicking the freshly loaded unpacked extension did nothing in a tab that was already open.
- Evidence: `#aisq-extension-root` count was `0` before page reload and `1` after reload.
- Root cause: Chrome does not retroactively execute a manifest content script in tabs that predate installation.
- Repair in 0.1.1: the action service worker first sent the toggle message, and on a missing receiver used the narrowly scoped `scripting` permission to inject `src/core.js` and `src/content.js`, then retried the toggle with bounded backoff.
- V0.3.0 extends that repair with stale-runtime cleanup before remount, a `SHOW` handshake after injection, durable pre-click state, and an atomic service-worker runner lease. The current source has passed local DOM verification; the installed Chrome copy still needs its unpacked extension reloaded before the new footer/version can be rechecked live.
- After injection, the toolbar action visibly toggled the panel. The live shadow root contained the AISQ bubble and Build/Prompts/Run/Settings tabs.

## Prompt import and real Build

V0.2.0 introduced the ordered stack of paste chains; V0.3.0 keeps Build open for uninterrupted pastes and pins runner scope independently from inspection. Existing evidence below records the earlier single-chain run and remains useful for host-selector verification.

The disposable verification pack contained a shared global preface and two headings:

1. `Stage 1 — Create test app`
2. `Stage 2 — Verify continuation`

Live import evidence:

- detected strategy: `stage`
- detected count: `2 prompts`
- prompt cards: `2`
- start-page host state: empty composer and Build with `aria-disabled="true"`

Queue Pilot filled the start composer, clicked Build once, and AI Studio navigated to a new app URL while retaining the pending queue.

## Observed creation states

The first real build passed through these states:

1. New editor URL created from the Apps start page.
2. Assistant header `Gemini 3.6 Flash Running for …`.
3. A new `Design previews are ready` carousel with five design candidates and a checked default.
4. `Applying file changes`.
5. The design gate resolved automatically without Queue Pilot clicking a design.
6. Stage 1 terminal header: `Gemini 3.6 Flash Ran for 44s`.
7. Queue Pilot paced, submitted Stage 2, and received `Gemini 3.6 Flash Ran for 20s`.
8. Both prompt cards became `complete` and the runner became idle/done.

The design-selection state is therefore recorded but does not currently need automatic interaction. A future persistent design gate should be exposed as an explicit opt-in policy, not clicked silently.

## Output verification

The final AI Studio preview iframe and assistant transcript both contained:

- `STAGE_TWO_OK`
- `Queue completed`

The transcript retained Stage 1 evidence (`STAGE_ONE_OK`) followed by the Stage 2 user turn and terminal assistant turn, proving that the second prompt was submitted only after the first completed.

## Settings

Live Settings values were:

- continue automatically across the stack: on
- automatic retry: on
- maximum retries: `2`
- retry delay: `5` seconds
- settle window: `2.5` seconds
- inter-prompt delay: `3` seconds
- inter-chain delay: `3` seconds
- start timeout: `20` seconds
- completion timeout: `12` minutes
- automatic Allow access: off
- automatic Auto-fix: off
- automatic ZIP on completion: off

## ZIP export

The live helper successfully switched Preview to Code and found `button[aria-label="Export options"]`. The first 0.1.0 attempt expanded the control before AI Studio mounted its overlay, so the fixed 250 ms lookup missed the item. Reopening the menu exposed the exact item `Download as .zip file — Standard project archive`; clicking it closed the menu and initiated the browser download.

Repair in 0.1.1, retained in 0.2.0:

- wait up to three seconds for the Export control after switching views;
- wait for the actual menu item instead of a fixed 250 ms delay;
- if Export is marked expanded but the overlay is absent, close and reopen once;
- select only the exact app archive item, never file-level download icons.

## Remaining live gate

After the unpacked extension is reloaded in `chrome://extensions`, repeat the live check with three pastes: A containing two prompts, B containing one, and C containing two. Reorder C before B and verify the exact execution order `A1 → A2 → C1 → C2 → B1`. Also verify that the toolbar click mounts the V0.3.0 panel after a reload, repeated pastes remain in Build, and inspecting another chain does not change the running chain.

The retry state machine is covered by DOM integration tests and was designed from a previously observed real AI Studio `Canceled` turn with `ms-error-callout`, “An internal error occurred,” and Retry. A fresh real service failure was not forced during this successful disposable build; doing so would require inducing an external failure rather than normal app construction.
