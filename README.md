# AI Studio Queue Pilot

A Manifest V3 Chrome extension for state-aware, stacked prompt chains in [Google AI Studio Apps](https://aistudio.google.com/apps). It supports both the Apps start page and an existing app editor, survives normal page navigation/reloads through `chrome.storage.local`, retries only the pending turn, and uses the current two-step ZIP export menu.

## Install locally

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select `/Users/min/projects/google-aistudio-chrome-extension`.
5. Open `https://aistudio.google.com/apps`. If it was already open, clicking the toolbar icon injects Queue Pilot automatically; a page reload also works.

The purple **AISQ** bubble appears at the lower-right. The toolbar action and `Alt+Shift+A` also toggle the panel.

## Use

1. In **Build**, paste a prompt pack and choose **Auto detect** or an explicit split strategy.
2. Each intentional paste becomes one chain containing one or more prompts and is appended to the **Execution stack**. You can paste again while another chain is running.
3. In **Prompts**, select a chain, rename it, reorder future chains, and edit/reorder future prompt items. The current pending and completed items are protected.
4. In **Run**, choose **Start** to execute the full stack, or **Run selected** for one chain.

On the Apps start page, the first item is submitted with **Build** and the queue survives the navigation into the generated app. In an editor, items use the assistant **Send** button. `Alt+Enter` starts or resumes the queue when focus is outside Queue Pilot.

The selected chain is only the chain being inspected; it does not interrupt the chain currently owned by the runner. Turn off **Continue automatically across the stack** in Settings for one-at-a-time operation: the runner completes the current item, leaves the next composer empty, and waits for **Resume**.

The Build intake remains open after every paste so several clipboard packs can be stacked without changing tabs. During execution, only chains after the active chain can move; Queue Pilot rejects a reorder or insertion that could strand future work behind the runner. A service-worker lease permits exactly one AI Studio tab to own submissions at a time. A manual pause retains the lease while a prompt is pending; after a tab closes or its lease expires, recovery requires an explicit **Recover here** action in the same bound AI Studio app. Other tabs cannot pause or skip the owner tab's active work.

Queue Pilot does not depend on AI Studio’s **Submit prompt** preference (`Cmd + Enter` versus `Enter`); it invokes the visible Build/Send control directly.

## Completion and recovery rules

- A prompt is marked pending before any click.
- The awaiting state is durably committed before Build, Send, or Retry is clicked; if storage fails, Queue Pilot pauses without clicking.
- The runner records the current assistant-turn count.
- Only a newer turn can affect the pending prompt.
- `Running for …`, `Assembling`, or `Thinking` means busy.
- `Ran for …` begins a configurable settle window; completion is committed only if that new turn remains successful.
- `Canceled`, `Failed`, error callouts, and the current turn’s **Retry** button enter bounded retry recovery.
- The next prompt is never preloaded while a run is busy, during retry, or during pacing.
- A start timeout and a longer completion timeout pause with an actionable error instead of silently skipping.
- **Allow access** and **Auto-fix** automation are off by default because both can have meaningful effects.

## ZIP export

Choose **Download ZIP** in Run. Queue Pilot opens **Code**, selects **Export options**, then chooses **Download as .zip file**. This replaces the removed `aria-label="Download app"` button used by older console scripts.

## Privacy and permissions

The extension requests only:

- `storage` for local queue/recovery state;
- `scripting` so a toolbar click can inject Queue Pilot into an AI Studio tab that was already open when the unpacked extension was loaded;
- host access to `https://aistudio.google.com/apps*` so its content script can operate there.

Prompts stay in `chrome.storage.local`. V1 queue state is migrated to the V2 chain/stack schema without resubmitting pending work. There is no analytics, remote service, credential access, cookie access, or network exfiltration.

**Diagnostics** downloads a local JSON snapshot without requiring a downloads permission. It omits prompt text, prompt labels, chain names, raw source, internal IDs, and history messages; it retains only anonymous references, statuses, attempts, text lengths, timings, settings, and host-state flags needed for troubleshooting.

## Development

```bash
npm run verify
```

The 40-test suite includes parser/state-machine and exact A/B/C stack-order checks plus DOM-level extension fixtures for accessible shadow-root mounting, stale-root remount cleanup, uninterrupted one-paste/one-chain FIFO imports, start-page Build, durable pre-click commit, hidden-control and blocking-dialog handling, app-bound pending recovery, explicit completion, lifecycle activity, scoped retry, manual send-next, selected-run ownership, cross-tab leasing and synchronization, stale-write rejection, persisted Settings policies, redacted diagnostics, ZIP export, large/corrupt-state handling, manifest permissions/icons, and toolbar messaging.

A clean deterministic distribution archive is generated with `npm run package:extension` at `dist/ai-studio-queue-pilot-0.3.0.zip`, alongside its SHA-256 file. Load the project directory itself for unpacked development.

Implementation notes and the evidence-based selector map are in [docs/ui-state-map.md](docs/ui-state-map.md). The detailed comparison with the five supplied console-script collections is in [docs/comparison.md](docs/comparison.md).
The real signed-in Build/queue/output evidence is recorded in [docs/live-verification.md](docs/live-verification.md).
Current gate status and release steps are tracked in [docs/production-readiness.md](docs/production-readiness.md) and [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).
The exact disposable A/B/C fixture used for signed-in acceptance is in [docs/live-acceptance-pack.md](docs/live-acceptance-pack.md).
