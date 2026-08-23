# Queue Pilot 0.4.0 signed-in acceptance pack

Use a disposable Google AI Studio app. These fixtures create visible order markers without external services, account changes, permissions, or paid integrations. Paste each fenced block once into Queue Pilot **Build**; do not paste the fence markers themselves.

## Paste A — expected detection: 2 prompts

```text
Shared acceptance rule: Work only inside the disposable test app. Do not add external services, authentication, network calls, or dependencies. Preserve every existing QUEUE_PILOT marker in its current order. The visible marker list must have id "queue-pilot-acceptance-order".

Prompt 1 — AISQ_A1
Create a compact visible card titled "Queue Pilot Acceptance". In its ordered marker list, append exactly one item whose text is AISQ_A1_OK. Do not add any other AISQ_* marker. Finish by stating AISQ_A1_OK in the assistant response.

Prompt 2 — AISQ_A2
Preserve the existing acceptance card and marker order. Append exactly one new final list item whose text is AISQ_A2_OK. Do not duplicate or reorder AISQ_A1_OK. Finish by stating AISQ_A2_OK in the assistant response.
```

## Paste B — expected detection: 1 prompt

Before pasting B, set **Raw Text Splitter format** to **Single prompt**. Auto-detect intentionally routes one standalone paragraph to the app-description wizard; the explicit strategy verifies the single-prompt queue path.

```text
AISQ_B1: Preserve the existing Queue Pilot Acceptance card and marker order. Append exactly one new final list item whose text is AISQ_B1_OK. Do not duplicate or reorder prior AISQ_* markers. Do not add external services or dependencies. Finish by stating AISQ_B1_OK in the assistant response.
```

## Paste C — expected detection: 2 prompts

```text
Shared acceptance rule: Preserve the existing Queue Pilot Acceptance card and every existing AISQ_* marker in its current order. Do not add external services, authentication, network calls, or dependencies.

Prompt 1 — AISQ_C1
Append exactly one new final list item whose text is AISQ_C1_OK. Do not duplicate or reorder prior markers. Finish by stating AISQ_C1_OK in the assistant response.

Prompt 2 — AISQ_C2
Append exactly one new final list item whose text is AISQ_C2_OK. Do not duplicate or reorder prior markers. Finish by stating AISQ_C2_OK in the assistant response.
```

## Required procedure and evidence

1. Reload the unpacked extension and confirm the Queue Pilot footer is `v0.4.0`.
2. In a pre-existing AI Studio Apps tab, click the toolbar icon and confirm Queue Pilot mounts and opens. Repeat in a fresh Apps tab.
3. Describe a small app. Confirm the Draft Plan appears immediately, asks no more than three automatic questions, and separates **You chose**, **Suggested**, **Still needed**, and **Needs review**.
4. Inspect the **Decision map** at normal width and at a 320px viewport. Confirm progress/readiness is text-visible, no horizontal panning is needed, Arrow Up/Down/Home/End traverse available nodes, locked nodes explain why, and selecting a node focuses its one decision card.
5. Choose **Other / custom** for App Type. Enter `Autonomous real-time medical drone system`, map it to **agent-swarm**, and confirm the map prioritizes physical failure safety, agent authority, and regulated-data decisions while disclosing every capped decision and its conservative assumption.
6. Choose **Other / custom** for Project Size. Enter `Regional hospital pilot`, map it to **production**, and confirm Industry and Security become required. Also load a JSON/template with an unknown category or size and confirm queueing remains blocked until a compatible profile is explicitly selected.
7. Return to Build and choose **Full Wizard**. Confirm the original form opens with the description preserved, supports the same custom category/size controls, and **Review Concept Map** shows the same decisions rather than a separate legacy plan.
8. Change or safely skip one non-required Draft Plan question, reload, and confirm the Draft Plan, active question, provenance, and custom paths rehydrate without duplicate roots or listeners.
9. Approve assumptions to **Add to Queue** and confirm exactly one chain is added with no host click. Repeat with **Approve assumptions & Run** and confirm exactly one chain and one host submission.
10. Load a built-in or saved template, confirm its values are proposed, and verify **Save as Template** persists one entry.
11. In one disposable app, paste A, B, and C without leaving Build. Use **Single prompt** for B, then return to **Auto-detect** for C. Confirm the stack meter advances to `3 chain(s) · 5 prompt(s)`.
12. In Prompts, rename the chains A, B, and C. Move C before B and confirm order A, C, B.
13. Start the full stack. While A1 is running, inspect B and confirm the Run tab still identifies A/A1 as runner-owned.
14. After C1 visibly starts, reload the AI Studio page once. Confirm the pending marker does not submit twice and execution safely resumes or pauses with an explicit diagnostic. In a different app tab, confirm Pause/Skip are unavailable and **Recover here** rejects the wrong app.
15. At completion, verify the user-turn/transcript marker order is exactly `AISQ_A1 → AISQ_A2 → AISQ_C1 → AISQ_C2 → AISQ_B1`.
16. Verify the preview list is exactly `AISQ_A1_OK`, `AISQ_A2_OK`, `AISQ_C1_OK`, `AISQ_C2_OK`, `AISQ_B1_OK`.
17. Download redacted diagnostics and confirm it contains statuses and lengths but none of the fixture prompt text.
18. Run **Download ZIP** and verify Code → Export options → Download as `.zip` initiates the application archive.
19. Record screenshots, Concept Map width/keyboard observations, custom-profile results, transcript order, reload behavior, diagnostics result, console errors, and ZIP result in `docs/live-verification.md`.

If AI Studio itself rewrites the preview incorrectly but the transcript proves correct transport order, classify transport as pass and generated-output fidelity as an external-model limitation. If the transcript order is wrong, Queue Pilot fails the gate.
