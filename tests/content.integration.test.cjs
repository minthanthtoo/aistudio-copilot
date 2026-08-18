"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const Core = require("../src/core.js");

const projectRoot = path.resolve(__dirname, "..");
const coreSource = fs.readFileSync(path.join(projectRoot, "src/core.js"), "utf8");
const contentSource = fs.readFileSync(path.join(projectRoot, "src/content.js"), "utf8");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function installVisibleGeometry(window) {
  const rectangle = (element) => {
    const hidden = !!element.closest?.("[hidden], [aria-hidden=\"true\"]") || element.style?.display === "none";
    return hidden
      ? { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() { return this; } }
      : { x: 0, y: 0, top: 0, left: 0, right: 200, bottom: 40, width: 200, height: 40, toJSON() { return this; } };
  };
  window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return rectangle(this);
  };
  window.HTMLElement.prototype.getClientRects = function getClientRects() {
    const rect = rectangle(this);
    return rect.width ? [rect] : [];
  };
}

async function createEnvironment(body, initialState = null, options = {}) {
  const backend = options.storageBackend || { data: initialState ? { aisqStateV1: structuredClone(initialState) } : {}, listeners: new Set() };
  const storage = backend.data;
  const listeners = [];
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${body}</body></html>`, {
    url: options.url || "https://aistudio.google.com/apps/test-app",
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const { window } = dom;
  installVisibleGeometry(window);
  window.chrome = {
    storage: {
      local: {
        async get(key) {
          return key ? { [key]: structuredClone(storage[key]) } : structuredClone(storage);
        },
        async set(values) {
          if (options.failStorageSet) throw new Error("fixture storage write failed");
          const changes = {};
          for (const [key, value] of Object.entries(values)) changes[key] = { oldValue: structuredClone(storage[key]), newValue: structuredClone(value) };
          Object.assign(storage, structuredClone(values));
          for (const listener of backend.listeners) listener(structuredClone(changes), "local");
        }
      },
      onChanged: {
        addListener(listener) { backend.listeners.add(listener); },
        removeListener(listener) { backend.listeners.delete(listener); }
      }
    },
    runtime: {
      ...(options.sendMessage ? { sendMessage: options.sendMessage } : {}),
      getManifest() { return { version: "test" }; },
      onMessage: { addListener(listener) { listeners.push(listener); } }
    }
  };
  options.beforeContent?.(window);
  window.eval(coreSource);
  window.eval(contentSource);
  await wait(120);
  return {
    dom,
    window,
    storage,
    listeners,
    root: () => window.document.getElementById("aisq-extension-root"),
    shadow: () => window.document.getElementById("aisq-extension-root")?.shadowRoot,
    close() { dom.window.__AISQ_RUNTIME__?.stop?.(); dom.window.close(); }
  };
}

function pendingState({ baselineTurnCount = 0, retryCount = 0, settings = {} } = {}) {
  const prompt = {
    id: "prompt-1",
    label: "Fixture prompt",
    text: "Build the verified fixture feature.",
    status: "pending",
    attempts: 1,
    submittedAt: Core.nowISO(),
    completedAt: null,
    error: null
  };
  const queue = Core.makeQueue("Fixture queue", [prompt], prompt.text);
  queue.id = "queue-1";
  const state = Core.defaultState();
  state.queues = [queue];
  state.activeQueueId = queue.id;
  state.settings = { ...state.settings, settleMs: 30, retryDelayMs: 20, interPromptDelayMs: 20, ...settings };
  state.runner = {
    ...state.runner,
    phase: Core.PHASES.AWAITING,
    enabled: true,
    pendingPromptId: prompt.id,
    submittedAt: Date.now(),
    baselineTurnCount,
    retryCount
  };
  return state;
}

test("content script mounts an isolated shadow UI and toggles without TrustedHTML", async (t) => {
  const env = await createEnvironment('<textarea placeholder="Describe an app and let Gemini do the rest"></textarea><button class="build-button" aria-disabled="true">Build</button>');
  t.after(() => env.close());
  const root = env.root();
  assert.ok(root);
  assert.ok(root.shadowRoot);
  assert.equal(root.shadowRoot.getElementById("aisq-panel").hidden, true);
  assert.equal(root.shadowRoot.getElementById("aisq-panel").getAttribute("aria-label"), "AI Studio Queue Pilot");
  assert.equal(root.shadowRoot.getElementById("aisq-bubble").getAttribute("aria-label"), "Toggle AI Studio Queue Pilot");
  root.shadowRoot.getElementById("aisq-bubble").click();
  await wait(40);
  assert.equal(root.shadowRoot.getElementById("aisq-panel").hidden, false);
  assert.match(root.shadowRoot.textContent, /Queue Pilot/);
  assert.equal(root.shadowRoot.querySelectorAll('[role="tab"]').length, 4);
});

test("stale-root reinjection stops the prior runtime before remounting", async (t) => {
  const env = await createEnvironment('<textarea placeholder="Describe an app and let Gemini do the rest"></textarea><button class="build-button" aria-disabled="true">Build</button>');
  t.after(() => env.close());
  const firstRuntime = env.window.__AISQ_RUNTIME__;
  env.root().remove();
  env.window.eval(contentSource);
  await wait(140);
  assert.equal(env.window.document.querySelectorAll("#aisq-extension-root").length, 1);
  assert.ok(env.window.__AISQ_RUNTIME__);
  assert.notEqual(env.window.__AISQ_RUNTIME__, firstRuntime);
});

test("start-page queue imports, fills through input events, and clicks Build once", async (t) => {
  const env = await createEnvironment('<textarea id="start" placeholder="Describe an app and let Gemini do the rest"></textarea><button id="build" class="build-button button-hidden" aria-disabled="true">Build <span>keyboard_return</span></button>');
  t.after(() => env.close());
  const textarea = env.window.document.getElementById("start");
  const build = env.window.document.getElementById("build");
  let inputEvents = 0;
  let buildClicks = 0;
  let persistedPhaseAtClick = null;
  textarea.addEventListener("input", () => {
    inputEvents += 1;
    build.setAttribute("aria-disabled", textarea.value.trim() ? "false" : "true");
    build.classList.toggle("button-hidden", !textarea.value.trim());
  });
  build.addEventListener("click", () => {
    buildClicks += 1;
    persistedPhaseAtClick = env.storage.aisqStateV2?.runner?.phase || null;
  });

  const shadow = env.shadow();
  shadow.getElementById("aisq-bubble").click();
  await wait(30);
  const draft = shadow.querySelector(".aisq-draft");
  const promptText = "Build a small production test app with one page and no external integrations.";
  draft.value = promptText;
  draft.dispatchEvent(new env.window.Event("input", { bubbles: true }));
  shadow.querySelector(".aisq-actions .primary").click();
  await wait(50);
  Array.from(shadow.querySelectorAll(".aisq-tab")).find((node) => node.textContent === "run").click();
  await wait(50);
  Array.from(shadow.querySelectorAll(".aisq-button")).find((node) => node.textContent === "Start").click();
  await wait(1200);

  assert.equal(textarea.value, promptText);
  assert.equal(draft.value, "");
  assert.ok(inputEvents >= 1);
  assert.equal(buildClicks, 1);
  assert.equal(persistedPhaseAtClick, Core.PHASES.AWAITING);
  const runnerState = env.window.__aisq.state();
  assert.equal(runnerState.runner.phase, Core.PHASES.AWAITING);
  assert.equal(runnerState.queues[0].prompts[0].status, "pending");
  assert.equal(runnerState.runner.baselineTurnCount, 0);
});

test("a storage commit failure prevents the irreversible host click", async (t) => {
  const env = await createEnvironment('<textarea id="safe-start" placeholder="Describe an app and let Gemini do the rest"></textarea><button id="safe-build" class="build-button" aria-disabled="true">Build</button>', null, { failStorageSet: true });
  t.after(() => env.close());
  const textarea = env.window.document.getElementById("safe-start");
  const build = env.window.document.getElementById("safe-build");
  let clicks = 0;
  textarea.addEventListener("input", () => build.setAttribute("aria-disabled", textarea.value.trim() ? "false" : "true"));
  build.addEventListener("click", () => { clicks += 1; });

  env.shadow().getElementById("aisq-bubble").click();
  await wait(30);
  const draft = env.shadow().querySelector(".aisq-draft");
  draft.value = "Build a fixture that must never be clicked before durable state is committed.";
  draft.dispatchEvent(new env.window.Event("input", { bubbles: true }));
  Array.from(env.shadow().querySelectorAll(".aisq-button")).find((node) => node.textContent === "Add chain").click();
  Array.from(env.shadow().querySelectorAll(".aisq-tab")).find((node) => node.textContent === "run").click();
  await wait(50);
  Array.from(env.shadow().querySelectorAll(".aisq-button")).find((node) => node.textContent === "Start").click();
  await wait(1200);

  assert.equal(clicks, 0);
  const state = env.window.__aisq.state();
  assert.equal(state.runner.enabled, false);
  assert.equal(state.runner.phase, Core.PHASES.PAUSED);
  assert.match(state.runner.lastError, /storage write failed/i);
});

test("hidden duplicate controls are ignored and a guided-tour dialog blocks submission", async (t) => {
  const chain = Core.makeChain("Blocked fixture", Core.parsePromptPack("Build a fixture only after the visible blocker is removed.", "single").prompts, "fixture");
  const state = Core.migrateState({ chains: [chain], stackOrder: [chain.id], selectedChainId: chain.id });
  state.settings.panelOpen = true;
  state.settings.activeTab = "run";
  const env = await createEnvironment(`
    <ms-code-assistant-chat aria-hidden="true">
      <textarea id="hidden-editor" placeholder="Make changes, add new features, ask for anything"></textarea>
      <button id="hidden-send" aria-label="Send" aria-disabled="false"></button>
    </ms-code-assistant-chat>
    <textarea id="visible-start" placeholder="Describe an app and let Gemini do the rest"></textarea>
    <button id="visible-build" class="build-button" aria-disabled="false">Build</button>
    <div role="dialog">Welcome to the guided tour</div>`, state);
  t.after(() => env.close());
  let buildClicks = 0;
  env.window.document.getElementById("visible-build").addEventListener("click", () => { buildClicks += 1; });
  assert.equal(env.window.__aisq.scan().mode, "start");
  assert.equal(env.window.__aisq.scan().blocked, true);

  Array.from(env.shadow().querySelectorAll(".aisq-button")).find((node) => node.textContent === "Start").click();
  await wait(700);
  assert.equal(buildClicks, 0);
  assert.equal(env.window.document.getElementById("visible-start").value, "");
  assert.equal(env.window.document.getElementById("hidden-editor").value, "");
  assert.match(env.window.__aisq.state().runner.lastHostState, /blocked/i);
});

test("a persisted start submission resumes in the editor and completes only on a new successful turn", async (t) => {
  const state = pendingState({ baselineTurnCount: 0 });
  state.runner.boundPageKey = "/apps";
  const env = await createEnvironment(`
    <ms-code-assistant-chat>
      <div class="turn-container"><div class="turn"><div class="turn-header">Gemini 3.6 Flash Running for 1s</div><span>Assembling</span></div></div>
      <textarea placeholder="Make changes, add new features, ask for anything"></textarea>
      <button aria-label="Send" class="send-button disabled" aria-disabled="true"></button>
    </ms-code-assistant-chat>`, state);
  t.after(() => env.close());

  await wait(650);
  assert.equal(env.window.__aisq.state().runner.phase, Core.PHASES.RUNNING);
  assert.equal(env.window.__aisq.state().runner.boundPageKey, "/apps/test-app");
  const header = env.window.document.querySelector(".turn-header");
  header.textContent = "Gemini 3.6 Flash Ran for 9s";
  env.window.document.querySelector(".turn span").textContent = "Done";
  await wait(1200);

  const finished = env.window.__aisq.state();
  assert.equal(finished.runner.boundPageKey, null);
  assert.equal(finished.queues[0].prompts[0].status, "complete");
  assert.equal(finished.runner.phase, Core.PHASES.DONE);
  assert.equal(finished.runner.pendingPromptId, null);
});

test("applying-file and preview-generation lifecycle text remains a busy host state", async (t) => {
  const env = await createEnvironment(`
    <ms-code-assistant-chat>
      <div class="turn-container"><div class="turn"><div class="turn-header">Gemini 3.6 Flash</div><span>Applying file changes</span></div></div>
      <textarea placeholder="Make changes, add new features, ask for anything"></textarea>
      <button aria-label="Send" aria-disabled="true"></button>
    </ms-code-assistant-chat>`);
  t.after(() => env.close());
  assert.equal(env.window.__aisq.scan().busy, true);
  env.window.document.querySelector(".turn span").textContent = "Generating design previews…";
  assert.equal(env.window.__aisq.scan().busy, true);
});

test("retry is scoped to the newest failed turn and exhaustion pauses the same prompt", async (t) => {
  const state = pendingState({ baselineTurnCount: 1, settings: { maxRetries: 1 } });
  const env = await createEnvironment(`
    <ms-code-assistant-chat>
      <div class="turn-container">
        <div class="turn"><div class="turn-header">Gemini 3.5 Flash Canceled</div><ms-chat-turn-error><ms-error-callout><button id="old-retry">Retry</button></ms-error-callout></ms-chat-turn-error></div>
        <div class="turn"><div class="turn-header">Gemini 3.6 Flash Canceled</div><ms-chat-turn-error><ms-error-callout>An internal error occurred.<button id="current-retry">Retry</button></ms-error-callout></ms-chat-turn-error></div>
      </div>
      <textarea placeholder="Make changes, add new features, ask for anything"></textarea>
      <button aria-label="Send" aria-disabled="true"></button>
    </ms-code-assistant-chat>`, state);
  t.after(() => env.close());
  let oldClicks = 0;
  let currentClicks = 0;
  env.window.document.getElementById("old-retry").addEventListener("click", () => { oldClicks += 1; });
  env.window.document.getElementById("current-retry").addEventListener("click", () => { currentClicks += 1; });

  await wait(1200);
  assert.equal(oldClicks, 0);
  assert.equal(currentClicks, 1);
  assert.equal(env.window.__aisq.state().runner.phase, Core.PHASES.AWAITING);
  assert.equal(env.window.__aisq.state().runner.retryCount, 1);

  const nextTurn = env.window.document.createElement("div");
  nextTurn.className = "turn";
  const nextHeader = env.window.document.createElement("div");
  nextHeader.className = "turn-header";
  nextHeader.textContent = "Gemini 3.6 Flash Canceled";
  const nextError = env.window.document.createElement("ms-chat-turn-error");
  const nextCallout = env.window.document.createElement("ms-error-callout");
  nextCallout.textContent = "An internal error occurred.";
  const nextRetry = env.window.document.createElement("button");
  nextRetry.textContent = "Retry";
  nextCallout.append(nextRetry);
  nextError.append(nextCallout);
  nextTurn.append(nextHeader, nextError);
  env.window.document.querySelector(".turn-container").append(nextTurn);
  await wait(700);

  const exhausted = env.window.__aisq.state();
  assert.equal(exhausted.runner.phase, Core.PHASES.PAUSED);
  assert.equal(exhausted.runner.enabled, false);
  assert.equal(exhausted.queues[0].prompts[0].status, "error");
  assert.match(exhausted.runner.lastError, /internal error/i);
});

test("ZIP helper follows Code to Export options to the exact archive item", async (t) => {
  const state = Core.defaultState();
  state.settings.panelOpen = true;
  state.settings.activeTab = "run";
  const env = await createEnvironment(`
    <button id="code"><span>code</span> Code</button>
    <button id="export" aria-label="Export options" hidden>Export</button>
    <div id="menu" hidden><button role="menuitem" id="zip">Download as .zip file Standard project archive</button><button role="menuitem">Download current file</button></div>
    <ms-code-assistant-chat><textarea placeholder="Make changes, add new features, ask for anything"></textarea><button aria-label="Send" aria-disabled="true"></button></ms-code-assistant-chat>`, state);
  t.after(() => env.close());
  let zipClicks = 0;
  let exportClicks = 0;
  let codeClicks = 0;
  env.window.document.getElementById("code").addEventListener("click", () => {
    codeClicks += 1;
    env.window.document.getElementById("export").hidden = false;
  });
  env.window.document.getElementById("export").addEventListener("click", () => {
    exportClicks += 1;
    const exportButton = env.window.document.getElementById("export");
    if (exportClicks === 1) {
      exportButton.setAttribute("aria-expanded", "true");
    } else if (exportClicks === 2) {
      exportButton.setAttribute("aria-expanded", "false");
    } else {
      exportButton.setAttribute("aria-expanded", "true");
      env.window.document.getElementById("menu").hidden = false;
    }
  });
  env.window.document.getElementById("zip").addEventListener("click", () => { zipClicks += 1; });

  const download = Array.from(env.shadow().querySelectorAll(".aisq-button")).find((node) => node.textContent === "Download ZIP");
  assert.ok(download);
  download.click();
  await wait(3000);
  assert.equal(codeClicks, 1);
  assert.equal(exportClicks, 3);
  assert.equal(zipClicks, 1);
  assert.equal(env.window.__aisq.state().runner.lastError, null);
});

test("manual mode completes one prompt and waits for an explicit Resume before filling the next", async (t) => {
  const state = pendingState({ baselineTurnCount: 0, settings: { autoRun: false } });
  state.settings.panelOpen = true;
  state.settings.activeTab = "run";
  state.queues[0].prompts.push({
    id: "prompt-2",
    label: "Second fixture prompt",
    text: "Build the second verified fixture feature.",
    status: "queued",
    attempts: 0,
    submittedAt: null,
    completedAt: null,
    error: null
  });
  const env = await createEnvironment(`
    <ms-code-assistant-chat>
      <div class="turn-container"><div class="turn"><div class="turn-header">Gemini 3.6 Flash Ran for 7s</div></div></div>
      <textarea id="manual-composer" placeholder="Make changes, add new features, ask for anything"></textarea>
      <button id="manual-send" aria-label="Send" aria-disabled="false"></button>
    </ms-code-assistant-chat>`, state);
  t.after(() => env.close());
  let sends = 0;
  env.window.document.getElementById("manual-send").addEventListener("click", () => { sends += 1; });

  await wait(1200);
  const paused = env.window.__aisq.state();
  assert.equal(paused.queues[0].prompts[0].status, "complete");
  assert.equal(paused.queues[0].prompts[1].status, "queued");
  assert.equal(paused.runner.phase, Core.PHASES.PAUSED);
  assert.equal(paused.runner.enabled, false);
  assert.equal(env.window.document.getElementById("manual-composer").value, "");
  assert.equal(sends, 0);

  const resume = Array.from(env.shadow().querySelectorAll(".aisq-button")).find((node) => node.textContent === "Resume");
  assert.ok(resume);
  resume.click();
  await wait(1200);
  assert.equal(env.window.document.getElementById("manual-composer").value, state.queues[0].prompts[1].text);
  assert.equal(sends, 1);
});

test("inspecting another chain cannot redirect a selected-only runner", async (t) => {
  const first = Core.makeChain("Pinned A", Core.parsePromptPack("Complete the pinned selected-only prompt.", "single").prompts, "A");
  const second = Core.makeChain("Inspected B", Core.parsePromptPack("This chain must remain queued and must not be submitted.", "single").prompts, "B");
  first.prompts[0].status = "pending";
  first.prompts[0].submittedAt = Core.nowISO();
  const state = Core.migrateState({ chains: [first, second], stackOrder: [first.id, second.id], selectedChainId: first.id });
  state.settings.panelOpen = true;
  state.settings.activeTab = "prompts";
  state.settings.settleMs = 30;
  state.runner = {
    ...state.runner,
    enabled: true,
    scope: "selected",
    scopeChainId: first.id,
    activeChainId: first.id,
    pendingPromptId: first.prompts[0].id,
    phase: Core.PHASES.AWAITING,
    baselineTurnCount: 0,
    submittedAt: Date.now()
  };
  const env = await createEnvironment(`
    <ms-code-assistant-chat>
      <div class="turn-container"><div class="turn"><div class="turn-header">Gemini 3.6 Flash Ran for 5s</div></div></div>
      <textarea id="scope-composer" placeholder="Make changes, add new features, ask for anything"></textarea>
      <button id="scope-send" aria-label="Send" aria-disabled="false"></button>
    </ms-code-assistant-chat>`, state);
  t.after(() => env.close());
  let sends = 0;
  env.window.document.getElementById("scope-send").addEventListener("click", () => { sends += 1; });
  const select = env.shadow().querySelector(".aisq-select");
  select.value = second.id;
  select.dispatchEvent(new env.window.Event("change", { bubbles: true }));
  await wait(1200);

  const finished = env.window.__aisq.state();
  assert.equal(finished.selectedChainId, second.id);
  assert.equal(finished.chains.find((chain) => chain.id === first.id).prompts[0].status, "complete");
  assert.equal(finished.chains.find((chain) => chain.id === second.id).prompts[0].status, "queued");
  assert.equal(finished.runner.phase, Core.PHASES.DONE);
  assert.equal(sends, 0);
});

test("multiple imported queues remain selectable when no prompt is pending", async (t) => {
  const state = Core.defaultState();
  const first = Core.makeQueue("First queue", Core.parsePromptPack("First substantial standalone prompt.", "single").prompts, "first");
  const second = Core.makeQueue("Second queue", Core.parsePromptPack("Second substantial standalone prompt.", "single").prompts, "second");
  state.queues = [first, second];
  state.activeQueueId = first.id;
  state.settings.panelOpen = true;
  state.settings.activeTab = "prompts";
  const env = await createEnvironment("", state);
  t.after(() => env.close());

  const select = env.shadow().querySelector(".aisq-select");
  assert.ok(select);
  assert.equal(select.options.length, 2);
  select.value = second.id;
  select.dispatchEvent(new env.window.Event("change", { bubbles: true }));
  await wait(50);
  assert.equal(env.window.__aisq.state().activeQueueId, second.id);
  assert.match(env.shadow().textContent, /Second queue/);
});

test("Settings controls update and persist runner policy without touching host submit behavior", async (t) => {
  const state = Core.defaultState();
  state.settings.panelOpen = true;
  state.settings.activeTab = "settings";
  const env = await createEnvironment('<ms-code-assistant-chat><textarea placeholder="Make changes, add new features, ask for anything"></textarea><button aria-label="Send" aria-disabled="false"></button></ms-code-assistant-chat>', state);
  t.after(() => env.close());
  const settingLabels = Array.from(env.shadow().querySelectorAll("label"));
  const automatic = settingLabels.find((label) => /Continue automatically across the stack/.test(label.textContent)).querySelector('input[type="checkbox"]');
  automatic.checked = false;
  automatic.dispatchEvent(new env.window.Event("change", { bubbles: true }));
  const retries = settingLabels.find((label) => /Maximum retries/.test(label.textContent)).querySelector('input[type="number"]');
  retries.value = "4";
  retries.dispatchEvent(new env.window.Event("change", { bubbles: true }));
  const failure = Array.from(env.shadow().querySelectorAll("select")).find((select) => Array.from(select.options).some((option) => option.value === "skip_chain"));
  failure.value = "skip_chain";
  failure.dispatchEvent(new env.window.Event("change", { bubbles: true }));
  await wait(140);

  const updated = env.window.__aisq.state();
  assert.equal(updated.settings.autoRun, false);
  assert.equal(updated.settings.maxRetries, 4);
  assert.equal(updated.settings.failurePolicy, "skip_chain");
  assert.equal(env.storage.aisqStateV2.settings.failurePolicy, "skip_chain");
  assert.equal(env.window.document.querySelector('button[aria-label="Send"]').getAttribute("aria-disabled"), "false");
});

test("diagnostics download is permission-free and omits prompt text, labels, and chain names", async (t) => {
  const secretPrompt = "TOP_SECRET_PROMPT_TEXT that must never appear in diagnostics.";
  const chain = Core.makeChain("TOP_SECRET_CHAIN_NAME", Core.parsePromptPack(secretPrompt, "single").prompts, secretPrompt);
  chain.prompts[0].label = "TOP_SECRET_PROMPT_LABEL";
  const state = Core.migrateState({ chains: [chain], stackOrder: [chain.id], selectedChainId: chain.id });
  state.settings.panelOpen = true;
  state.settings.activeTab = "run";
  let downloads = 0;
  let createdBlob = null;
  const env = await createEnvironment("", state, {
    beforeContent(window) {
      window.URL.createObjectURL = (blob) => { createdBlob = blob; return "blob:fixture"; };
      window.URL.revokeObjectURL = () => {};
      window.HTMLAnchorElement.prototype.click = function click() { downloads += 1; };
    }
  });
  t.after(() => env.close());

  const diagnostic = env.window.__aisq.diagnostics();
  const serialized = JSON.stringify(diagnostic);
  assert.equal(diagnostic.format, "aisq-redacted-diagnostics-v1");
  assert.equal(diagnostic.chains[0].prompts[0].textLength, secretPrompt.length);
  assert.equal("sourceHash" in diagnostic.chains[0], false);
  assert.equal("lastError" in diagnostic.runner, false);
  assert.equal("lastHostState" in diagnostic.runner, false);
  assert.doesNotMatch(serialized, /TOP_SECRET/);
  assert.doesNotMatch(serialized, new RegExp(chain.id));
  assert.doesNotMatch(serialized, new RegExp(chain.prompts[0].id));

  const button = Array.from(env.shadow().querySelectorAll(".aisq-button")).find((node) => node.textContent === "Diagnostics");
  assert.ok(button);
  button.click();
  await wait(100);
  assert.equal(downloads, 1);
  assert.ok(createdBlob);
  assert.equal(createdBlob.type, "application/json");
  assert.ok(env.window.__aisq.state().history.some((entry) => entry.kind === "diagnostics"));
});

test("each paste creates one FIFO chain without resetting an active runner", async (t) => {
  const state = Core.defaultState();
  state.settings.panelOpen = true;
  state.settings.activeTab = "build";
  state.runner.enabled = true;
  state.runner.phase = Core.PHASES.RUNNING;
  const env = await createEnvironment('<textarea placeholder="Describe an app and let Gemini do the rest"></textarea><button class="build-button" aria-disabled="true">Build</button>', state);
  t.after(() => env.close());
  const paste = (text) => {
    const draft = env.shadow().querySelector(".aisq-draft");
    assert.ok(draft, "Build intake remains mounted for uninterrupted pastes");
    const event = new env.window.Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => text } });
    draft.dispatchEvent(event);
  };
  paste("A1 substantial prompt that should remain in chain A.\n\n---\n\nA2 substantial prompt that should remain in chain A.");
  await wait(80);
  paste("B1 substantial prompt that should remain in chain B.");
  await wait(80);
  const result = env.window.__aisq.state();
  assert.equal(result.chains.length, 2);
  assert.deepEqual(result.stackOrder, result.chains.map((chain) => chain.id));
  assert.equal(result.chains[0].prompts.length, 2);
  assert.equal(result.chains[1].prompts.length, 1);
  assert.equal(result.runner.enabled, true);
  assert.equal(result.runner.phase, Core.PHASES.RUNNING);
  assert.equal(result.settings.activeTab, "build");
  assert.ok(env.shadow().querySelector(".aisq-draft"));
  assert.match(env.shadow().textContent, /Stack now: 2 chain\(s\) · 3 prompt\(s\)/);
});

test("two content-script instances honor the service-worker runner lease", async (t) => {
  let owner = null;
  let token = null;
  const sender = (tabId) => (message, callback) => {
    let response = null;
    if (message.type === "AISQ_GET_TAB_ID") response = { tabId };
    else if (message.type === "AISQ_LEASE_ACQUIRE") {
      if (owner !== null && owner !== tabId) response = { ok: false, ownerTabId: owner };
      else {
        owner = tabId;
        token = token || `lease-${tabId}`;
        response = { ok: true, tabId, token, expiresAt: Date.now() + 20_000 };
      }
    } else if (message.type === "AISQ_LEASE_HEARTBEAT") {
      response = owner === tabId && message.token === token ? { ok: true, tabId, token } : { ok: false, ownerTabId: owner };
    } else if (message.type === "AISQ_LEASE_RELEASE") {
      if (owner === tabId && message.token === token) {
        owner = null;
        token = null;
      }
      response = { ok: true };
    }
    queueMicrotask(() => callback?.(response));
  };
  const queuedState = () => {
    const chain = Core.makeChain("Lease fixture", Core.parsePromptPack("Build one lease-safe production fixture.", "single").prompts, "fixture");
    const state = Core.migrateState({ chains: [chain], stackOrder: [chain.id], selectedChainId: chain.id });
    state.settings.panelOpen = true;
    state.settings.activeTab = "run";
    return state;
  };
  const body = '<textarea placeholder="Describe an app and let Gemini do the rest"></textarea><button class="build-button" aria-disabled="true">Build</button>';
  const first = await createEnvironment(body, queuedState(), { sendMessage: sender(11) });
  const second = await createEnvironment(body, queuedState(), { sendMessage: sender(22) });
  t.after(() => { first.close(); second.close(); });

  const clickNamed = (env, label) => Array.from(env.shadow().querySelectorAll(".aisq-button")).find((node) => node.textContent === label)?.click();
  clickNamed(first, "Start");
  await wait(120);
  clickNamed(second, "Start");
  await wait(120);
  assert.equal(first.window.__aisq.state().runner.enabled, true);
  assert.equal(first.window.__aisq.state().runner.ownerTabId, "11");
  assert.equal(second.window.__aisq.state().runner.enabled, false);
  assert.match(second.window.__aisq.state().runner.lastError, /another AI Studio tab/i);

  clickNamed(first, "Pause");
  await wait(80);
  clickNamed(second, "Start");
  await wait(120);
  assert.equal(second.window.__aisq.state().runner.enabled, false);
  assert.equal(second.window.__aisq.state().runner.ownerTabId, "11");
  assert.match(second.window.__aisq.state().runner.lastError, /another AI Studio tab/i);
});

test("a paused pending run retains ownership and can be explicitly recovered only in its bound app", async (t) => {
  let owner = null;
  let token = null;
  let releases = 0;
  const sender = (tabId) => (message, callback) => {
    let response = null;
    if (message.type === "AISQ_GET_TAB_ID") response = { tabId };
    else if (message.type === "AISQ_LEASE_ACQUIRE") {
      if (owner !== null && owner !== tabId) response = { ok: false, ownerTabId: owner };
      else {
        owner = tabId;
        token = token || `lease-${tabId}`;
        response = { ok: true, tabId, token, expiresAt: Date.now() + 20_000 };
      }
    } else if (message.type === "AISQ_LEASE_HEARTBEAT") response = owner === tabId && message.token === token ? { ok: true, tabId, token } : { ok: false, ownerTabId: owner };
    else if (message.type === "AISQ_LEASE_RELEASE") {
      if (owner === tabId && message.token === token) {
        owner = null;
        token = null;
        releases += 1;
      }
      response = { ok: true };
    }
    queueMicrotask(() => callback?.(response));
  };
  const chain = Core.makeChain("Bound app", Core.parsePromptPack("Build one app-bound recovery fixture.", "single").prompts, "fixture");
  const state = Core.migrateState({ chains: [chain], stackOrder: [chain.id], selectedChainId: chain.id });
  state.settings.panelOpen = true;
  state.settings.activeTab = "run";
  const backend = { data: { aisqStateV2: structuredClone(state) }, listeners: new Set() };
  const body = '<textarea placeholder="Describe an app and let Gemini do the rest"></textarea><button class="build-button" aria-disabled="false">Build</button>';
  const first = await createEnvironment(body, null, { storageBackend: backend, sendMessage: sender(11) });
  const second = await createEnvironment(body, null, { storageBackend: backend, sendMessage: sender(22) });
  let firstClosed = false;
  t.after(() => { if (!firstClosed) first.close(); second.close(); });
  const clickNamed = (env, label) => Array.from(env.shadow().querySelectorAll(".aisq-button")).find((node) => node.textContent === label)?.click();

  clickNamed(first, "Start");
  await wait(850);
  assert.equal(first.window.__aisq.state().runner.boundPageKey, "/apps/test-app");
  clickNamed(first, "Pause");
  await wait(150);
  assert.equal(first.window.__aisq.state().runner.enabled, false);
  assert.equal(first.window.__aisq.state().runner.ownerTabId, "11");
  assert.equal(releases, 0, "manual pause retains the pending lease");
  assert.equal(Array.from(second.shadow().querySelectorAll(".aisq-button")).some((node) => node.textContent === "Pause"), false);
  assert.ok(Array.from(second.shadow().querySelectorAll(".aisq-button")).some((node) => node.textContent === "Recover here"));

  clickNamed(second, "Recover here");
  await wait(120);
  assert.match(second.window.__aisq.state().runner.lastError, /original runner tab is still active/i);
  assert.equal(second.window.__aisq.state().runner.ownerTabId, "11");

  first.close();
  firstClosed = true;
  await wait(80);
  assert.equal(releases, 1);
  clickNamed(second, "Recover here");
  await wait(180);
  assert.equal(second.window.__aisq.state().runner.enabled, true);
  assert.equal(second.window.__aisq.state().runner.ownerTabId, "22");
  assert.ok(second.window.__aisq.state().history.some((entry) => entry.kind === "runner_recovered"));
});

test("pending recovery refuses a different AI Studio app before acquiring a lease", async (t) => {
  const chain = Core.makeChain("Original app", [Core.normalizePrompt({ id: "bound-prompt", text: "A bound pending prompt.", status: "pending" })], "fixture");
  const state = Core.migrateState({ chains: [chain], stackOrder: [chain.id], selectedChainId: chain.id });
  state.settings.panelOpen = true;
  state.settings.activeTab = "run";
  state.runner = { ...state.runner, enabled: false, phase: Core.PHASES.PAUSED, activeChainId: chain.id, pendingPromptId: "bound-prompt", ownerTabId: "11", boundPageKey: "/apps/original-app" };
  let acquireCalls = 0;
  const env = await createEnvironment("", state, {
    url: "https://aistudio.google.com/apps/different-app",
    sendMessage(message, callback) {
      if (message.type === "AISQ_GET_TAB_ID") queueMicrotask(() => callback?.({ tabId: 22 }));
      else if (message.type === "AISQ_LEASE_ACQUIRE") { acquireCalls += 1; queueMicrotask(() => callback?.({ ok: true, tabId: 22, token: "should-not-be-used" })); }
    }
  });
  t.after(() => env.close());
  const recover = Array.from(env.shadow().querySelectorAll(".aisq-button")).find((node) => node.textContent === "Recover here");
  assert.ok(recover);
  recover.click();
  await wait(100);
  assert.equal(acquireCalls, 0);
  assert.match(env.window.__aisq.state().runner.lastError, /belongs to \/apps\/original-app/i);
  assert.equal(env.window.__aisq.state().runner.ownerTabId, "11");
});

test("sequential queue edits synchronize across open AI Studio tabs", async (t) => {
  const initial = Core.defaultState();
  const backend = { data: { aisqStateV2: structuredClone(initial) }, listeners: new Set() };
  const first = await createEnvironment("", null, { storageBackend: backend });
  const second = await createEnvironment("", null, { storageBackend: backend });
  t.after(() => { first.close(); second.close(); });

  first.window.__aisq.importText("A synchronized production prompt from the first tab.", "single", { name: "Shared chain" });
  await wait(180);
  assert.equal(second.window.__aisq.state().chains.length, 1);
  assert.equal(second.window.__aisq.state().chains[0].name, "Shared chain");

  second.window.__aisq.show();
  await wait(80);
  Array.from(second.shadow().querySelectorAll(".aisq-tab")).find((node) => node.textContent === "prompts").click();
  await wait(80);
  const name = second.shadow().querySelector('.aisq-field input.aisq-input');
  assert.ok(name);
  name.value = "Renamed in tab two";
  name.dispatchEvent(new second.window.Event("change", { bubbles: true }));
  await wait(180);
  assert.equal(first.window.__aisq.state().chains[0].name, "Renamed in tab two");
});

test("a stale tab cannot overwrite a newer queue revision", async (t) => {
  const initial = Core.defaultState();
  const backend = { data: { aisqStateV2: structuredClone(initial) }, listeners: new Set() };
  const first = await createEnvironment("", null, { storageBackend: backend });
  const second = await createEnvironment("", null, { storageBackend: backend });
  t.after(() => { first.close(); second.close(); });
  const secondListener = Array.from(backend.listeners)[1];
  backend.listeners.delete(secondListener);

  first.window.__aisq.importText("Authoritative chain created in tab one.", "single", { name: "Authoritative" });
  await wait(160);
  assert.equal(backend.data.aisqStateV2.chains.length, 1);

  second.window.__aisq.importText("A stale conflicting chain from tab two.", "single", { name: "Stale conflict" });
  await wait(180);
  assert.equal(backend.data.aisqStateV2.chains.length, 1);
  assert.equal(backend.data.aisqStateV2.chains[0].name, "Authoritative");
  assert.equal(second.window.__aisq.state().chains[0].name, "Authoritative");
  assert.match(second.window.__aisq.state().runner.lastError, /newer queue change/i);
});
