# Signed-in live verification record

## 0.4.0 release audit (2026-08-21)

Current-source verification completed in the production-order harness:

- `npm run verify`: 117/117 tests passed, including both workflow choices, Concept Map graph/progress/navigation, deterministic custom paths, fail-closed category/size mapping, risk-prioritized branch caps, approval/chain fingerprints, Draft Plan provenance and migration, focus/layout coverage, wizard exact-once flows, keyed lease fencing, route migration, reinjection, and async-hydration cancellation.
- `npm audit --omit=dev`: zero vulnerabilities (run again after packaging if dependencies change).
- Manifest, package, and lockfile versions: `0.4.0`.
- Package archive: `dist/ai-studio-queue-pilot-0.4.0.zip`.
- SHA-256: recorded in the adjacent `.zip.sha256` sidecar and final release handoff.

The signed-in Chrome gate remains intentionally open until the unpacked 0.4.0 extension is freshly reloaded and the acceptance pack is executed. Do not treat the historical 0.3.x observations below as evidence for the current Draft Plan release.

## Live evidence entry

- Date/time:
- Chrome profile / extension reload:
- Footer version observed:
- Concept Map at 500px / 320px:
- Custom category / compatible profile:
- Custom size / delivery profile:
- Draft Plan description path:
- Template/JSON/ChatGPT paths:
- Exact-once Add to Queue result:
- Exact-once Generate & Run result:
- Reload/reinjection result:
- Two-tab lease result:
- A/B/C transport order:
- Diagnostics redaction result:
- ZIP export result:
- Console/CSP errors:
- Screenshots or transcript references:

## Historical host evidence (0.3.x)

The earlier signed-in observations remain useful for host-selector compatibility only. They demonstrated the AI Studio start-page Build flow, editor continuation, design-preview handling, transcript completion markers, and Code → Export options → Download as `.zip` behavior. They do not certify the v0.4.0 Draft Plan UI, schema-v3 rehydration, or approval command.

## Current acceptance procedure

Use [`docs/live-acceptance-pack.md`](live-acceptance-pack.md). Begin with a fresh reload, verify the Draft Plan flow, then run the disposable A/B/C queue fixtures. Record failures with the exact URL, footer version, console error, and whether a chain or host click was duplicated.
