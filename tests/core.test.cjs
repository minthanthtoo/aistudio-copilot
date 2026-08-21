"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
require("../src/core-constants.js");
require("../src/core-utils.js");
require("../src/core-state.js");
require("../src/core-selectors.js");
require("../src/core-commands.js");
const Core = global.AISQCore;
Object.assign(Core, require("../src/core-parser.js"));

test("Stage headings split a prompt pack and preserve the shared preface", () => {
  const input = `Global rules:\n- Keep the current stack.\n\n## Stage 1 — Scaffold\nBuild the shell and navigation with enough implementation detail.\n\n## Stage 2 — Data\nAdd the persistent data layer and validation with enough implementation detail.`;
  const result = Core.parsePromptPack(input);
  assert.equal(result.strategy, "stage");
  assert.equal(result.prompts.length, 2);
  assert.match(result.preface, /^Global rules:/);
  assert.match(result.prompts[0].text, /Stage 1/);
  assert.match(result.prompts[1].text, /Stage 2/);
  assert.match(result.prompts[0].label, /Stage 1/);
  assert.match(result.prompts[1].label, /Stage 2/);
});

test("P/R identifiers split only outside fenced code", () => {
  const input = `Shared constraints apply.\n\nP001 First real task\nImplement the first substantial unit without shortcuts.\n\n\`\`\`text\nP002 This is an example, not a boundary\n\`\`\`\n\nR002 Second real task\nReview and repair the finished unit with a real verification pass.`;
  const result = Core.parsePromptPack(input);
  assert.equal(result.strategy, "id");
  assert.equal(result.prompts.length, 2);
  assert.match(result.prompts[0].text, /P002 This is an example/);
  assert.match(result.prompts[1].text, /R002 Second real task/);
});

test("blank paragraphs and short incidental numbered lists remain one prompt", () => {
  const input = `Build a compact app.\n\nIt needs these items:\n1. Home\n2. Search\n3. Settings\n\nDo not split this prose into separate submissions.`;
  const result = Core.parsePromptPack(input);
  assert.equal(result.strategy, "single");
  assert.equal(result.prompts.length, 1);
});

test("explicit delimiters split substantial sections but ignore delimiters inside fences", () => {
  const input = `Create the first complete page with navigation, accessible structure, and realistic seeded content.\n\n\`\`\`md\n---\nnot a split\n\`\`\`\n\n---\n\nCreate the second complete page with filtering, empty states, error states, and keyboard support.`;
  const result = Core.parsePromptPack(input);
  assert.equal(result.strategy, "delimiter");
  assert.equal(result.prompts.length, 2);
});

test("large staged packs preserve all prompt boundaries without treating fenced examples as stages", () => {
  const sections = Array.from({ length: 300 }, (_, index) => `## Stage ${index + 1} — Production unit ${index + 1}\nImplement production unit ${index + 1} with validation, recovery, and verification.\n\n\`\`\`text\nStage 999 — fenced example only\n\`\`\``);
  const result = Core.parsePromptPack(`Global production rules apply to every unit.\n\n${sections.join("\n\n")}`);
  assert.equal(result.strategy, "stage");
  assert.equal(result.prompts.length, 300);
  assert.match(result.preface, /^Global production rules/);
  assert.match(result.prompts[299].text, /Stage 300/);
});

test("a stale terminal turn never starts or completes a newly submitted prompt", () => {
  const runner = {
    ...Core.defaultRunner(),
    phase: Core.PHASES.AWAITING,
    submittedAt: 1000,
    baselineTurnCount: 4
  };
  const settings = Core.defaultSettings();
  const decision = Core.decideRunnerTransition(runner, {
    turnCount: 4,
    lastHeader: "Gemini 3.5 Flash Ran for 15s"
  }, settings, 2000);
  assert.equal(decision.action, "none");
});

test("a new running turn transitions awaiting to running", () => {
  const runner = {
    ...Core.defaultRunner(),
    phase: Core.PHASES.AWAITING,
    submittedAt: 1000,
    baselineTurnCount: 2
  };
  const decision = Core.decideRunnerTransition(runner, {
    turnCount: 3,
    lastHeader: "Gemini 3.6 Flash Running for 1s",
    busy: true
  }, Core.defaultSettings(), 1500);
  assert.equal(decision.action, "mark_running");
  assert.equal(decision.phase, Core.PHASES.RUNNING);
});

test("a new successful turn requires a settle pass before completion", () => {
  const settings = Core.defaultSettings();
  const runner = {
    ...Core.defaultRunner(),
    phase: Core.PHASES.RUNNING,
    submittedAt: 1000,
    baselineTurnCount: 2,
    sawBusy: true
  };
  const host = { turnCount: 3, lastHeader: "Gemini 3.6 Flash Ran for 23s" };
  const first = Core.decideRunnerTransition(runner, host, settings, 5000);
  assert.equal(first.action, "begin_settle");

  const settling = { ...runner, phase: Core.PHASES.SETTLING, settleUntil: 8000 };
  assert.equal(Core.decideRunnerTransition(settling, host, settings, 7000).action, "none");
  assert.equal(Core.decideRunnerTransition(settling, host, settings, 8000).action, "complete_prompt");
});

test("failure schedules a bounded retry, then pauses after the retry budget", () => {
  const settings = { ...Core.defaultSettings(), maxRetries: 2 };
  const host = {
    turnCount: 6,
    lastHeader: "Gemini 3.6 Flash Canceled",
    retryVisible: true,
    errorText: "An internal error occurred."
  };
  const base = {
    ...Core.defaultRunner(),
    phase: Core.PHASES.RUNNING,
    submittedAt: 1000,
    baselineTurnCount: 5,
    retryCount: 1
  };
  assert.equal(Core.decideRunnerTransition(base, host, settings, 2000).action, "schedule_retry");
  assert.equal(Core.decideRunnerTransition({ ...base, retryCount: 2 }, host, settings, 2000).action, "pause_for_failure");
});

test("start and completion timeouts have distinct diagnostics", () => {
  const settings = { ...Core.defaultSettings(), startTimeoutMs: 1000, completionTimeoutMs: 5000 };
  const awaiting = { ...Core.defaultRunner(), phase: Core.PHASES.AWAITING, submittedAt: 1000, baselineTurnCount: 1 };
  const running = { ...awaiting, phase: Core.PHASES.RUNNING, sawBusy: true };
  assert.match(Core.decideRunnerTransition(awaiting, { turnCount: 1 }, settings, 2501).message, /did not start/);
  assert.match(Core.decideRunnerTransition(running, { turnCount: 2, busy: true }, settings, 7001).message, /completion timeout/);
});

test("state migration retains queues while filling new safe defaults", () => {
  const migrated = Core.migrateState({ queues: [{ id: "q1", prompts: [] }], settings: { maxRetries: 7 } });
  assert.equal(migrated.queues.length, 1);
  assert.equal(migrated.settings.maxRetries, 7);
  assert.equal(migrated.settings.autoFix, false);
  assert.equal(migrated.runner.phase, Core.PHASES.READY);
});

test("empty storage migration creates usable project and runner aliases", () => {
  const migrated = Core.migrateState(null);
  assert.deepEqual(migrated.chains, []);
  assert.deepEqual(migrated.stackOrder, []);
  assert.equal(migrated.selectedChainId, null);
  assert.equal(migrated.runner.phase, Core.PHASES.READY);
});

test("AI Studio route variants share stable semantic page keys", () => {
  const routes = new Map([
    ["/apps", "app:home"],
    ["/apps/", "app:home"],
    ["/app/apps", "app:home"],
    ["/apps/example-app", "app:example-app"],
    ["/app/apps/example-app", "app:example-app"],
    ["/prompts", "prompt:home"],
    ["/app/prompts/", "prompt:home"],
    ["/prompts/example-prompt", "prompt:example-prompt"],
    ["/app/prompts/example-prompt", "prompt:example-prompt"],
    ["/unrelated", "root"]
  ]);
  for (const [route, expected] of routes) assert.equal(Core.pageKeyForPath(route), expected, route);
  assert.equal(Core.pageKeyForPath("/apps/example-app?mode=edit"), "app:example-app");
  assert.equal(Core.normalizePageKey("app:existing"), "app:existing");
});

test("v0.3.6 root-scoped work migrates once without overwriting a canonical target", () => {
  const previousWindow = global.window;
  global.window = { location: { pathname: "/apps/example-app" } };
  try {
    const chain = Core.makeChain("Legacy", [Core.normalizePrompt({ text: "Preserve this queued task." })]);
    const runner = {
      ...Core.defaultRunner(),
      phase: Core.PHASES.AWAITING,
      enabled: true,
      activeChainId: chain.id,
      pendingPromptId: chain.prompts[0].id,
      boundPageKey: "/apps/example-app"
    };
    const migrated = Core.migrateState({
      projects: { root: { chains: [chain], stackOrder: [chain.id], selectedChainId: chain.id } },
      runners: { root: runner }
    });
    assert.equal(migrated.projects.root, undefined);
    assert.equal(migrated.projects["app:example-app"].chains[0].id, chain.id);
    assert.equal(migrated.runners.root, undefined);
    assert.equal(migrated.runners["app:example-app"].boundPageKey, "app:example-app");

    const homeBound = Core.migrateState({
      projects: { root: { chains: [chain], stackOrder: [chain.id], selectedChainId: chain.id } },
      runners: { root: { ...runner, boundPageKey: "app:home" } }
    });
    assert.equal(homeBound.projects["app:example-app"].chains[0].id, chain.id);
    assert.equal(homeBound.runners["app:example-app"].pendingPromptId, chain.prompts[0].id);
    assert.equal(homeBound.runners["app:example-app"].boundPageKey, "app:home");

    global.window.location.pathname = "/apps/other-app";
    const boundElsewhere = Core.migrateState({
      projects: { root: { chains: [chain], stackOrder: [chain.id], selectedChainId: chain.id } },
      runners: { root: runner }
    });
    assert.equal(boundElsewhere.projects["app:example-app"].chains[0].id, chain.id);
    assert.equal(boundElsewhere.runners["app:example-app"].pendingPromptId, chain.prompts[0].id);
    assert.equal(boundElsewhere.projects.root, undefined);
    assert.equal(boundElsewhere.runners.root, undefined);
    global.window.location.pathname = "/apps/example-app";

    const existing = { chains: [], stackOrder: [], selectedChainId: null };
    const conflict = Core.migrateState({
      projects: { root: { chains: [chain], stackOrder: [chain.id], selectedChainId: chain.id }, "app:example-app": existing },
      runners: { root: runner, "app:example-app": { ...Core.defaultRunner(), phase: Core.PHASES.PAUSED } }
    });
    assert.equal(conflict.projects.root.chains[0].id, chain.id);
    assert.equal(conflict.projects["app:example-app"].chains.length, 0);
    assert.equal(conflict.runners.root.pendingPromptId, chain.prompts[0].id);
    assert.equal(conflict.runners["app:example-app"].phase, Core.PHASES.PAUSED);

    const projectOnlyConflict = Core.migrateState({
      projects: { root: { chains: [chain], stackOrder: [chain.id], selectedChainId: chain.id }, "app:example-app": existing },
      runners: { root: runner }
    });
    assert.equal(projectOnlyConflict.projects.root.chains[0].id, chain.id);
    assert.equal(projectOnlyConflict.runners.root.pendingPromptId, chain.prompts[0].id);
    assert.equal(projectOnlyConflict.projects["app:example-app"].chains.length, 0);
    assert.equal(projectOnlyConflict.runners["app:example-app"].pendingPromptId, null);

    const runnerOnlyConflict = Core.migrateState({
      projects: { root: { chains: [chain], stackOrder: [chain.id], selectedChainId: chain.id } },
      runners: { root: runner, "app:example-app": { ...Core.defaultRunner(), phase: Core.PHASES.PAUSED } }
    });
    assert.equal(runnerOnlyConflict.projects.root.chains[0].id, chain.id);
    assert.equal(runnerOnlyConflict.runners.root.pendingPromptId, chain.prompts[0].id);
    assert.equal(runnerOnlyConflict.projects["app:example-app"].chains.length, 0);
    assert.equal(runnerOnlyConflict.runners["app:example-app"].phase, Core.PHASES.PAUSED);
  } finally {
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  }
});

test("corrupt partial state migration repairs stack order and pending ownership idempotently", () => {
  const raw = {
    schemaVersion: 1,
    queues: [
      { id: "a", name: "A", prompts: [{ id: "a1", text: "A recoverable queued prompt.", status: "unknown" }] },
      { id: "b", name: "B", prompts: [{ id: "b1", text: "A recoverable pending prompt.", status: "pending" }] }
    ],
    stackOrder: ["missing", "b", "b"],
    activeQueueId: "missing",
    runner: { enabled: true, phase: Core.PHASES.AWAITING, activeChainId: "missing", pendingPromptId: "b1" }
  };
  const migrated = Core.migrateState(raw);
  assert.deepEqual(migrated.stackOrder, ["b", "a"]);
  assert.equal(migrated.selectedChainId, "b");
  assert.equal(migrated.runner.activeChainId, "b");
  assert.equal(migrated.chains.find((chain) => chain.id === "a").prompts[0].status, "queued");
  assert.equal(migrated.chains.find((chain) => chain.id === "b").prompts[0].status, "pending");
  assert.deepEqual(Core.migrateState(migrated), migrated);
});

test("queue reordering cannot strand an unsent prompt before the saved cursor", () => {
  const queue = {
    cursor: 2,
    prompts: [
      { id: "moved", status: "queued" },
      { id: "done", status: "complete" },
      { id: "later", status: "queued" }
    ]
  };
  assert.equal(Core.nextQueuedPrompt(queue).id, "moved");
  assert.equal(queue.cursor, 0);
});

test("V2 stack advances FIFO across chains without wrapping", () => {
  const a = Core.makeChain("A", Core.parsePromptPack("A1 prompt with enough detail to be a standalone task.", "single").prompts, "A");
  a.prompts.push(...Core.parsePromptPack("A2 prompt with enough detail to be a standalone task.", "single").prompts);
  const b = Core.makeChain("B", Core.parsePromptPack("B1 prompt with enough detail to be a standalone task.", "single").prompts, "B");
  const c = Core.makeChain("C", Core.parsePromptPack("C1 prompt with enough detail to be a standalone task.", "single").prompts, "C");
  c.prompts.push(...Core.parsePromptPack("C2 prompt with enough detail to be a standalone task.", "single").prompts);
  const state = Core.migrateState({ chains: [a, b, c], stackOrder: [a.id, b.id, c.id], selectedChainId: a.id });
  assert.equal(Core.applyCommand(state, { type: "MOVE_CHAIN", payload: { chainId: c.id, direction: -1 } }).ok, true);
  assert.deepEqual(state.stackOrder, [a.id, c.id, b.id]);

  const executionOrder = [];
  while (true) {
    const target = Core.nextStackTarget(state);
    if (!target) break;
    executionOrder.push(target.prompt.text.slice(0, 2));
    target.prompt.status = "complete";
    state.runner.activeChainId = target.chain.id;
  }
  assert.deepEqual(executionOrder, ["A1", "A2", "C1", "C2", "B1"]);
  assert.equal(Core.nextStackTarget(state), null);
});

test("stack item commands protect pending and completed prompts", () => {
  const chain = Core.makeChain("Locked", Core.parsePromptPack("A substantial prompt that is locked while it is running.", "single").prompts, "raw");
  const second = Core.normalizePrompt({ id: "future", text: "A future prompt with enough detail to run." });
  chain.prompts.push(second);
  const state = Core.migrateState({ chains: [chain], stackOrder: [chain.id], selectedChainId: chain.id });
  state.runner.activeChainId = chain.id;
  state.runner.pendingPromptId = chain.prompts[0].id;
  state.chains.find((item) => item.id === chain.id).prompts[0].status = "pending";
  assert.equal(Core.applyCommand(state, { type: "EDIT_PROMPT", payload: { chainId: chain.id, promptId: chain.prompts[0].id, text: "changed" } }).ok, false);
  assert.equal(Core.applyCommand(state, { type: "DELETE_PROMPT", payload: { chainId: chain.id, promptId: chain.prompts[0].id } }).ok, false);
  state.chains.find((item) => item.id === chain.id).prompts[0].status = "complete";
  state.runner.pendingPromptId = null;
  assert.equal(Core.applyCommand(state, { type: "EDIT_PROMPT", payload: { chainId: chain.id, promptId: chain.prompts[0].id, text: "changed" } }).ok, false);
  assert.equal(Core.applyCommand(state, { type: "MOVE_PROMPT", payload: { chainId: chain.id, promptId: second.id, direction: -1 } }).ok, false);
});

test("running stack reordering and insertion cannot cross the active-chain boundary", () => {
  const make = (name) => Core.makeChain(name, Core.parsePromptPack(`${name} production task with enough detail to execute safely.`, "single").prompts, name);
  const done = make("Done");
  const active = make("Active");
  const futureB = make("Future B");
  const futureC = make("Future C");
  done.prompts[0].status = "complete";
  const state = Core.migrateState({
    chains: [done, active, futureB, futureC],
    stackOrder: [done.id, active.id, futureB.id, futureC.id],
    selectedChainId: done.id,
    runner: { enabled: true, phase: Core.PHASES.RUNNING, activeChainId: active.id, pendingPromptId: active.prompts[0].id }
  });

  assert.equal(Core.applyCommand(state, { type: "MOVE_CHAIN", payload: { chainId: futureC.id, direction: -1 } }).ok, true);
  assert.deepEqual(state.stackOrder, [done.id, active.id, futureC.id, futureB.id]);
  assert.equal(Core.applyCommand(state, { type: "MOVE_CHAIN", payload: { chainId: futureC.id, direction: -1 } }).ok, false);
  assert.deepEqual(state.stackOrder, [done.id, active.id, futureC.id, futureB.id]);

  const imported = make("Imported");
  assert.equal(Core.applyCommand(state, { type: "IMPORT_CHAIN", payload: { chain: imported, placement: "after", afterChainId: done.id } }).ok, true);
  assert.deepEqual(state.stackOrder.slice(0, 3), [done.id, active.id, imported.id]);

  state.selectedChainId = done.id;
  const duplicate = Core.applyCommand(state, { type: "DUPLICATE_CHAIN", payload: { chainId: done.id } });
  assert.equal(duplicate.ok, true);
  assert.ok(state.stackOrder.indexOf(duplicate.value.id) > state.stackOrder.indexOf(active.id));
});

test("an active chain cannot be reset during pacing and skipped prompts require reset before editing", () => {
  const chain = Core.makeChain("Active", Core.parsePromptPack("A production prompt with enough implementation detail.", "single").prompts, "raw");
  chain.prompts.push(Core.normalizePrompt({ id: "skipped", text: "A deliberately skipped future prompt.", status: "skipped" }));
  const state = Core.migrateState({ chains: [chain], stackOrder: [chain.id], selectedChainId: chain.id });
  state.runner.enabled = true;
  state.runner.phase = Core.PHASES.PACING;
  state.runner.activeChainId = chain.id;
  assert.equal(Core.applyCommand(state, { type: "RESET_FROM_PROMPT", payload: { chainId: chain.id, promptId: chain.prompts[0].id } }).ok, false);
  assert.equal(Core.applyCommand(state, { type: "EDIT_PROMPT", payload: { chainId: chain.id, promptId: "skipped", text: "changed" } }).ok, false);
  assert.equal(Core.applyCommand(state, { type: "DELETE_PROMPT", payload: { chainId: chain.id, promptId: "skipped" } }).ok, false);
});
