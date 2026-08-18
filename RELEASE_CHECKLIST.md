# Release checklist

## Source and automated gates

- [x] Manifest, package, and lockfile versions match.
- [x] `npm run icons` succeeds and manifest PNG dimensions validate.
- [x] `npm audit --omit=dev` reports zero vulnerabilities.
- [x] `npm run verify` passes with the current 40-test suite; an earlier candidate also passed four repeat runs with zero flakes on 2026-08-13.
- [x] No `innerHTML`, `eval`, remote executable code, broad host permission, or unbounded retry loop is present.
- [x] Every confirmed production failure has a regression test.

## Signed-in Chrome gates

- [ ] Reload the unpacked project and confirm the footer shows the source version.
- [ ] Toolbar click mounts/toggles Queue Pilot in a tab open before reload and a fresh AI Studio Apps tab.
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

- [ ] Run `npm run package:extension` after the final source and documentation edits.
- [ ] Inspect the ZIP listing; it must contain only manifest, runtime source, icons, README, and release documentation.
- [ ] Re-run the package command and confirm the checksum is identical.
- [ ] Record the archive path and SHA-256 in the final handoff.
- [ ] Keep the previous archive available for rollback; do not publish without explicit authorization.
