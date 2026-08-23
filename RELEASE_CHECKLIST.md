# Release checklist

## v0.4.1 Draft Plan release

- [x] Manifest, package, and lockfile versions match `0.4.1`.
- [x] State schema v2 migrates to v3 without dropping legacy wizard answers.
- [x] Description, built-in template, JSON, and ChatGPT extraction paths create Draft Plans with provenance.
- [x] Draft Plan questions are deterministic, dependency-aware, and capped at three.
- [x] The original Full Wizard remains user-selectable from the visible Build workflow chooser and natural-intake action.
- [x] Assumption approval imports exactly one chain and the Run variant sets one run intent atomically.
- [x] Draft Plan question events remain local to the existing event log.

## Source and automated gates

- [x] Manifest, package, and lockfile versions match.
- [x] `npm run icons` succeeds and manifest PNG dimensions validate.
- [x] `npm audit --omit=dev` reports zero vulnerabilities.
- [x] `npm run verify` passes with the current 132-test suite, including both workflow choices, Draft Plan migration/provenance, manifest-order integration, wizard exact-once flows, route migration, reinjection, keyed lease fencing, and the fetch-policy allowlist.
- [x] No `innerHTML`, `eval`, remote executable code, broad host permission, or unbounded retry loop is present.
- [x] Every confirmed production failure has a regression test.

## Signed-in Chrome gates

- [ ] Reload the unpacked project and confirm the footer shows `v0.4.1`.
- [ ] Toolbar click mounts/toggles Queue Pilot in a tab open before reload and a fresh AI Studio Apps tab.
- [ ] Describe an app and confirm the Draft Plan appears immediately with no more than three questions.
- [ ] Change or skip a question, reload, and confirm the Draft Plan and provenance rehydrate.
- [ ] Approve assumptions to Add to Queue and confirm exactly one chain; repeat with Approve assumptions & Run and confirm exactly one host submission.
- [ ] Load a template and verify proposed assumptions remain visibly distinguishable until approval.
- [ ] Paste A=(A1,A2), B=(B1), and C=(C1,C2) without leaving Build.
- [ ] Reorder C before B and prove A1 → A2 → C1 → C2 → B1 in transcript/output.
- [ ] Select another chain while running and confirm runner ownership does not move.
- [ ] Reload/navigation during a disposable run resumes or pauses safely without duplicate submission.
- [ ] Confirm another app tab cannot pause/skip the owner and that **Recover here** rejects the wrong app.
- [ ] Confirm no Trusted Types, CSP, or fatal extension exception appears.
- [ ] Confirm Code → Export options → Download as .zip file initiates the app archive download.
- [ ] Download diagnostics and confirm prompt text, labels, chain names, source, and internal IDs are absent.
- [ ] Capture evidence in `docs/live-verification.md`.

## Package and handoff

- [x] Run `npm run package:extension` after the final source and documentation edits.
- [x] Inspect the ZIP listing; it contains only manifest, runtime source, icons, README, and release documentation.
- [x] Re-run the package command and confirm the checksum is identical.
- [x] Record the archive path and SHA-256 in the final handoff.
- [x] Keep the previous archive available for rollback; do not publish without explicit authorization.
- [x] Preserve the pre-existing untracked `dist/ai-studio-queue-pilot-0.3.7.zip.sha256` sidecar.
