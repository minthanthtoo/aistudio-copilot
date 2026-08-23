"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
require("../src/core-constants.js");
require("../src/core-utils.js");
require("../src/core-state.js");
require("../src/core-selectors.js");
const Core = require("../src/core-commands.js");
require("../src/core-parser.js");

const projectRoot = path.resolve(__dirname, "..");
const contentFiles = JSON.parse(fs.readFileSync(path.join(projectRoot, "manifest.json"), "utf8")).content_scripts[0].js;
const contentSources = new Map(contentFiles.map((file) => [file, fs.readFileSync(path.join(projectRoot, file), "utf8")]));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buttonNamed(root, label) {
  return Array.from(root.querySelectorAll("button")).find((button) => button.textContent.trim() === label || button.textContent.includes(label));
}

function appState(chains = [], { settings = {}, runner = {}, pageKey = "app:test-app" } = {}) {
  const stackOrder = chains.map((chain) => chain.id);
  return {
    schemaVersion: Core.SCHEMA_VERSION,
    revision: 0,
    projects: { [pageKey]: { chains, stackOrder, selectedChainId: stackOrder[0] || null } },
    runners: { [pageKey]: { ...Core.defaultRunner(), activeChainId: stackOrder[0] || null, ...runner } },
    settings: { ...Core.defaultSettings(), ...settings },
    ui: { draft: "", splitStrategy: "auto", detectedStrategy: "empty", lastImportId: null, specMode: "paste", specScreen: 0, specAnswers: {} },
    history: [],
    eventLog: []
  };
}

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
    url: options.url || "https://aistudio.google.com/app/apps/test-app",
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const { window } = dom;
  installVisibleGeometry(window);
  const callbackOrPromise = (value, callback) => {
    if (typeof callback === "function") queueMicrotask(() => callback(structuredClone(value)));
    return Promise.resolve(structuredClone(value));
  };
  window.chrome = {
    storage: {
      local: {
        get(key, callback) {
          const value = key ? { [key]: storage[key] } : storage;
          if (options.storageGetDelayMs) {
            return new Promise((resolve) => setTimeout(() => {
              const cloned = structuredClone(value);
              if (typeof callback === "function") callback(cloned);
              resolve(cloned);
            }, options.storageGetDelayMs));
          }
          return callbackOrPromise(value, callback);
        },
        set(values, callback) {
          const operation = () => {
            if (options.failStorageSet) throw new Error("fixture storage write failed");
            const changes = {};
            for (const [key, value] of Object.entries(values)) changes[key] = { oldValue: structuredClone(storage[key]), newValue: structuredClone(value) };
            Object.assign(storage, structuredClone(values));
            for (const listener of backend.listeners) listener(structuredClone(changes), "local");
          };
          try {
            operation();
            if (typeof callback === "function") queueMicrotask(callback);
            return Promise.resolve();
          } catch (error) {
            return Promise.reject(error);
          }
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
      onMessage: {
        addListener(listener) { listeners.push(listener); },
        removeListener(listener) { const index = listeners.indexOf(listener); if (index >= 0) listeners.splice(index, 1); }
      }
    }
  };
  options.beforeContent?.(window);
  const inject = () => contentFiles.forEach((file) => window.eval(contentSources.get(file)));
  inject();
  await wait(120);
  return {
    dom,
    window,
    storage,
    listeners,
    root: () => window.document.getElementById("aisq-extension-root"),
    shadow: () => window.document.getElementById("aisq-extension-root")?.shadowRoot,
    inject,
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
  return appState([queue], {
    settings: { settleMs: 30, retryDelayMs: 20, interPromptDelayMs: 20, ...settings },
    runner: {
    phase: Core.PHASES.AWAITING,
    enabled: true,
    activeChainId: queue.id,
    pendingPromptId: prompt.id,
    submittedAt: Date.now(),
    baselineTurnCount,
    retryCount
    }
  });
}

test("content script mounts an isolated shadow UI and toggles without TrustedHTML", async (t) => {
  const env = await createEnvironment('<textarea placeholder="Describe an app and let Gemini do the rest"></textarea><button class="build-button" aria-disabled="true">Build</button>');
  t.after(() => env.close());
  const root = env.root();
  assert.ok(root);
  assert.ok(root.shadowRoot);
  const panel = root.shadowRoot.getElementById("aisq-panel");
  assert.equal(panel.hidden, true);
  assert.equal(panel.getAttribute("aria-label"), "AI Studio Copilot");
  const styles = root.shadowRoot.querySelector("style").textContent;
  assert.match(styles, /#aisq-panel\s*\{/);
  assert.doesNotMatch(styles, /aisq-ctx\.panel/);
  assert.equal(root.shadowRoot.getElementById("aisq-bubble").getAttribute("aria-label"), "Toggle AI Studio Copilot");
  root.shadowRoot.getElementById("aisq-bubble").click();
  await wait(40);
  assert.equal(root.shadowRoot.getElementById("aisq-panel").hidden, false);
  assert.match(root.shadowRoot.textContent, /Copilot/);
  assert.equal(root.shadowRoot.querySelectorAll('[role="tab"]').length, 5);
  root.shadowRoot.querySelector(".aisq-window-controls button").click();
  await wait(40);
  assert.equal(panel.classList.contains("aisq-minimized"), true);
  assert.match(styles, /#aisq-panel\.aisq-minimized \.aisq-tabs,/);
  assert.doesNotMatch(styles, /#aisq-panel\.aisq-minimized \.aisq-header/);
  const maximize = root.shadowRoot.querySelector('button[aria-label="Maximize Copilot"]');
  assert.ok(maximize, "the header keeps an accessible maximize control");
  maximize.click();
  await wait(40);
  assert.equal(panel.classList.contains("aisq-minimized"), false);
  env.window.__aisq.hide();
  await wait(40);
  assert.equal(panel.hidden, true);
  env.window.__aisq.show();
  await wait(40);
  assert.equal(panel.hidden, false);
});

test("wizard detail flow imports one chain, starts once, and saves one template", async (t) => {
  const env = await createEnvironment('<textarea id="start" placeholder="Describe an app and let Gemini do the rest"></textarea><button id="build" class="build-button" aria-disabled="true">Build</button>');
  t.after(() => env.close());
  const hostBuild = env.window.document.getElementById("build");
  const hostInput = env.window.document.getElementById("start");
  let hostClicks = 0;
  hostInput.addEventListener("input", () => hostBuild.setAttribute("aria-disabled", hostInput.value.trim() ? "false" : "true"));
  hostBuild.addEventListener("click", () => { hostClicks += 1; });

  env.window.__aisq.show();
  await wait(40);
  const draft = env.shadow().querySelector(".aisq-draft");
  draft.value = "Create a lightweight inventory app for a small shop.";
  draft.dispatchEvent(new env.window.Event("input", { bubbles: true }));
  buttonNamed(env.shadow(), "Build with Wizard").click();
  await wait(60);
  assert.match(env.shadow().textContent, /App Wizard/);

  const save = buttonNamed(env.shadow(), "Save as Template");
  save.click();
  const templateName = Array.from(env.shadow().querySelectorAll("input")).find((input) => input.placeholder === "Template name...");
  templateName.value = "Inventory starter";
  save.click();
  await wait(60);
  assert.equal(env.storage.aisqTemplates.length, 1);
  assert.equal(env.storage.aisqTemplates[0].name, "Inventory starter");

  buttonNamed(env.shadow(), "Generate & Run").click();
  await wait(1300);
  const state = env.window.__aisq.state();
  assert.equal(state.chains.length, 1);
  assert.equal(state.chains[0].prompts.length > 0, true);
  assert.equal(hostClicks, 1);
});

test("wizard Add to Queue creates exactly one chain without host submission", async (t) => {
  const env = await createEnvironment('<textarea id="start" placeholder="Describe an app and let Gemini do the rest"></textarea><button id="build" class="build-button" aria-disabled="false">Build</button>');
  t.after(() => env.close());
  let hostClicks = 0;
  env.window.document.getElementById("build").addEventListener("click", () => { hostClicks += 1; });
  env.window.__aisq.show();
  await wait(40);
  const draft = env.shadow().querySelector(".aisq-draft");
  draft.value = "Create a personal reading tracker.";
  draft.dispatchEvent(new env.window.Event("input", { bubbles: true }));
  buttonNamed(env.shadow(), "Build with Wizard").click();
  await wait(60);
  const add = buttonNamed(env.shadow(), "Add to Queue");
  add.click();
  add.click();
  await wait(100);
  assert.equal(env.window.__aisq.state().chains.length, 1);
  assert.equal(hostClicks, 0);
});

test("natural intake lets the user choose the original full wizard", async (t) => {
  const env = await createEnvironment('<textarea placeholder="Describe an app and let Gemini do the rest"></textarea><button class="build-button" aria-disabled="true">Build</button>');
  t.after(() => env.close());
  env.window.__aisq.show();
  await wait(40);
  assert.ok(buttonNamed(env.shadow(), "Full Wizard"), "the workflow chooser is visible");
  const draft = env.shadow().querySelector(".aisq-draft");
  draft.value = "Create a personal reading tracker.";
  draft.dispatchEvent(new env.window.Event("input", { bubbles: true }));
  const fullAction = Array.from(env.shadow().querySelectorAll("button")).find((button) => button.textContent.trim() === "🧭 Open Full Wizard →");
  assert.ok(fullAction, "natural intake exposes the original wizard action");
  fullAction.click();
  await wait(100);
  const state = env.window.__aisq.state();
  assert.equal(state.ui.buildView, "wizard_details");
  assert.equal(state.ui.planDraft.version, 2);
  assert.equal(state.ui.planDraft.decisions.description.value, "Create a personal reading tracker.");
  assert.equal(state.ui.specAnswers.description, "Create a personal reading tracker.");
  assert.match(env.shadow().textContent, /App Wizard/);
});

test("draft plan is persisted as schema-v3 durable intent and rehydrates after reload", async (t) => {
  const backend = { data: {}, listeners: new Set() };
  const first = await createEnvironment('<textarea placeholder="Describe an app and let Gemini do the rest"></textarea><button class="build-button" aria-disabled="true">Build</button>', null, { storageBackend: backend });
  t.after(() => first.close());
  first.window.__aisq.show();
  await wait(40);
  const draft = first.shadow().querySelector(".aisq-draft");
  draft.value = "Create a low-interruption reading tracker for students.";
  draft.dispatchEvent(new first.window.Event("input", { bubbles: true }));
  buttonNamed(first.shadow(), "Build with Wizard").click();
  await wait(80);
  assert.equal(first.shadow().querySelectorAll(".aisq-plan-question").length, 1);
  assert.match(first.shadow().textContent, /Clarification 1 of 3/);
  assert.ok(first.window.__aisq.state().eventLog.some((entry) => entry.event === "PLAN_QUESTION_SHOWN"));
  buttonNamed(first.shadow(), "Accept shown value & continue").click();
  await wait(40);
  assert.match(first.shadow().textContent, /Clarification 2 of 3/);
  await first.window.__aisq.save();
  assert.equal(backend.data.aisqStateV3.schemaVersion, 3);
  assert.equal(backend.data.aisqStateV3.ui.planDraft.decisions.description.status, "confirmed");
  assert.equal(backend.data.aisqStateV3.ui.planDraft.decisions.frontend, undefined, "computed defaults stay out of durable decisions");

  const second = await createEnvironment('<textarea placeholder="Describe an app and let Gemini do the rest"></textarea><button class="build-button" aria-disabled="true">Build</button>', null, { storageBackend: backend });
  t.after(() => second.close());
  const rehydrated = second.window.__aisq.state();
  assert.equal(rehydrated.schemaVersion, 3);
  assert.equal(rehydrated.ui.planDraft.intent.rawDescription, "Create a low-interruption reading tracker for students.");
  assert.equal(rehydrated.ui.planDraft.decisions.description.source, "user");
});

test("draft plan question edits preserve focus and expose the narrow-layout contract", async (t) => {
  const env = await createEnvironment('<textarea placeholder="Describe an app and let Gemini do the rest"></textarea><button class="build-button" aria-disabled="true">Build</button>');
  t.after(() => env.close());
  env.window.__aisq.show();
  await wait(40);
  const draft = env.shadow().querySelector(".aisq-draft");
  draft.value = "Build app.";
  draft.dispatchEvent(new env.window.Event("input", { bubbles: true }));
  buttonNamed(env.shadow(), "Build with Wizard").click();
  await wait(80);

  const question = env.shadow().querySelector(".aisq-plan-question");
  const control = question.querySelector('[data-plan-key="description"]') || question.querySelector("textarea, input, select");
  assert.ok(control, "the active clarification has a semantic form control");
  assert.equal(control.closest("label")?.querySelector(".aisq-label")?.textContent.length > 0, true, "the control has a visible label");
  control.focus();
  const key = control.getAttribute("data-plan-key");
  const editedValue = key === "description" ? "Build a focused reading tracker." : "Reading Tracker";
  control.value = editedValue;
  control.dispatchEvent(new env.window.Event("change", { bubbles: true }));
  await wait(50);
  assert.equal(env.shadow().activeElement, control, "changing a clarification does not steal keyboard focus");
  assert.equal(env.window.__aisq.state().ui.planDraft.decisions[key].value, editedValue);
  assert.equal(env.shadow().querySelector(".aisq-plan-question"), question, "change commits without a full rerender");

  const styles = env.shadow().querySelector("style").textContent;
  assert.match(styles, /width:min\(500px,calc\(100vw - 24px\)\)/);
  assert.match(styles, /@media \(max-width:360px\)[\s\S]*\.aisq-plan-actions \.aisq-button \{ width:100%; \}/);
});

test("Draft Plan exposes an accessible navigable concept map with honest progress and consequences", async (t) => {
  const env = await createEnvironment('<textarea placeholder="Describe an app and let Gemini do the rest"></textarea><button class="build-button" aria-disabled="true">Build</button>');
  t.after(() => env.close());
  env.window.__aisq.show();
  await wait(40);
  const draft = env.shadow().querySelector(".aisq-draft");
  draft.value = "Build app.";
  draft.dispatchEvent(new env.window.Event("input", { bubbles: true }));
  buttonNamed(env.shadow(), "Build with Wizard").click();
  await wait(100);

  const map = env.shadow().querySelector('.aisq-plan-map [role="tree"]');
  assert.ok(map, "the decision graph has a semantic tree projection");
  assert.ok(map.querySelectorAll('[role="treeitem"]').length >= 10);
  const progress = env.shadow().querySelector(".aisq-plan-map progress");
  assert.ok(progress);
  assert.ok(Number(progress.value) < Number(progress.max), "computed assumptions do not count as confirmed progress");
  const locked = Array.from(map.querySelectorAll('[role="treeitem"]')).find((item) => item.getAttribute("aria-disabled") === "true");
  assert.ok(locked?.querySelector("button")?.disabled, "locked nodes explain state and cannot be activated");
  const navigable = Array.from(map.querySelectorAll("button:not(:disabled)"));
  navigable[0].focus();
  navigable[0].dispatchEvent(new env.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  assert.equal(env.shadow().activeElement, navigable[1], "arrow keys traverse the semantic map");
  assert.match(env.shadow().textContent, /scale: hobby[\s\S]*affects stages, architecture, risk/i);
  assert.doesNotMatch(env.shadow().textContent, /% confidence/);

  buttonNamed(map, "Who is the primary user?").click();
  await wait(70);
  const audienceControl = env.shadow().querySelector('[data-plan-key="audience"]');
  assert.ok(audienceControl, "map navigation focuses a non-linear decision");
  assert.equal(env.shadow().activeElement, audienceControl, "the active decision receives keyboard focus after a map jump");
  assert.equal(env.shadow().querySelectorAll(".aisq-plan-question").length, 1, "the overview retains one focus card");
});

test("Draft Plan custom category and size create durable bounded custom paths", async (t) => {
  const backend = { data: {}, listeners: new Set() };
  const env = await createEnvironment('<textarea placeholder="Describe an app and let Gemini do the rest"></textarea><button class="build-button" aria-disabled="true">Build</button>', null, { storageBackend: backend });
  t.after(() => env.close());
  env.window.__aisq.show();
  await wait(40);
  const draft = env.shadow().querySelector(".aisq-draft");
  draft.value = "Build a focused workspace for specialized field teams.";
  draft.dispatchEvent(new env.window.Event("input", { bubbles: true }));
  buttonNamed(env.shadow(), "Build with Wizard").click();
  await wait(100);

  let category = env.shadow().querySelector('[data-plan-key="archetype"]');
  category.value = "__aisq_custom__";
  category.dispatchEvent(new env.window.Event("change", { bubbles: true }));
  await wait(80);
  const categoryRaw = env.shadow().querySelector('[data-plan-custom-raw="archetype"]');
  const categoryProfile = env.shadow().querySelector('[data-plan-custom-profile="archetype"]');
  assert.ok(categoryRaw && categoryProfile);
  assert.equal(env.shadow().activeElement, categoryRaw, "opening a custom path moves keyboard focus to its wording field");
  categoryRaw.value = "Real-time medical triage workspace";
  categoryProfile.value = "saas";
  buttonNamed(env.shadow(), "Use custom path").click();
  await wait(100);

  let state = env.window.__aisq.state();
  assert.equal(state.ui.planDraft.decisions.archetype.value, "saas");
  assert.equal(state.ui.planDraft.decisions.archetypeDetail.value, "Real-time medical triage workspace");
  assert.match(env.shadow().textContent, /What sensitive or regulated data/);
  assert.match(env.shadow().textContent, /simultaneous edits and temporary disconnections/);
  assert.match(env.shadow().textContent, /2 additional matching custom decisions use conservative assumptions/);

  buttonNamed(env.shadow().querySelector(".aisq-plan-map"), "How far should the first version go?").click();
  await wait(70);
  let size = env.shadow().querySelector('[data-plan-key="scale"]');
  size.value = "__aisq_custom__";
  size.dispatchEvent(new env.window.Event("change", { bubbles: true }));
  await wait(80);
  const sizeRaw = env.shadow().querySelector('[data-plan-custom-raw="scale"]');
  const sizeProfile = env.shadow().querySelector('[data-plan-custom-profile="scale"]');
  sizeRaw.value = "Regional hospital pilot";
  sizeProfile.value = "production";
  buttonNamed(env.shadow(), "Use custom path").click();
  await wait(100);

  state = env.window.__aisq.state();
  assert.equal(state.ui.planDraft.decisions.scale.value, "production");
  assert.equal(state.ui.planDraft.decisions.scaleDetail.value, "Regional hospital pilot");
  const resolved = env.window.AISQPlan.resolveDraft(state.ui.planDraft, { specApi: env.window.AISQSpec });
  assert.ok(resolved.customQuestions.length <= 3);
  assert.ok(resolved.requiredQuestionIds.includes("industry"));
  assert.ok(resolved.requiredQuestionIds.includes("security"));
  assert.equal(resolved.generatedAnswers.scale, "production");
  assert.equal(resolved.generatedAnswers.customContext.length, resolved.customQuestions.length + resolved.omittedCustomQuestions.length);
  assert.equal(resolved.graph.omittedCustomBranches.length, resolved.omittedCustomQuestions.length);
  assert.equal(JSON.stringify(resolved.generatedAnswers).includes("__aisq_custom__"), false);
  await env.window.__aisq.save();
  assert.equal(backend.data.aisqStateV3.ui.planDraft.decisions.archetypeDetail.value, "Real-time medical triage workspace");
  assert.equal(backend.data.aisqStateV3.ui.planDraft.decisions.scaleDetail.value, "Regional hospital pilot");
});

test("Full Wizard edits the same graph and approves a custom category exactly once", async (t) => {
  const env = await createEnvironment('<textarea id="start" placeholder="Describe an app and let Gemini do the rest"></textarea><button id="build" class="build-button" aria-disabled="false">Build</button>');
  t.after(() => env.close());
  let hostClicks = 0;
  env.window.document.getElementById("build").addEventListener("click", () => { hostClicks += 1; });
  env.window.__aisq.show();
  await wait(40);
  buttonNamed(env.shadow(), "Full Wizard").click();
  const draft = env.shadow().querySelector(".aisq-draft");
  draft.value = "Build a collaborative workspace for a small design team.";
  draft.dispatchEvent(new env.window.Event("input", { bubbles: true }));
  buttonNamed(env.shadow(), "Build with Wizard").click();
  await wait(100);

  let category = env.shadow().querySelector('[data-wizard-profile="archetype"]');
  category.value = "__custom__";
  category.dispatchEvent(new env.window.Event("change", { bubbles: true }));
  await wait(80);
  const raw = env.shadow().querySelector('[data-wizard-custom-raw="archetype"]');
  const canonical = env.shadow().querySelector('[data-wizard-custom-canonical="archetype"]');
  assert.equal(env.shadow().activeElement, raw, "Full Wizard moves focus into the revealed custom field");
  raw.value = "Real-time collaborative design studio";
  canonical.value = "saas";
  buttonNamed(env.shadow(), "Apply custom path").click();
  await wait(100);
  const size = env.shadow().querySelector('[data-wizard-profile="scale"]');
  size.value = "mvp";
  size.dispatchEvent(new env.window.Event("change", { bubbles: true }));
  await wait(80);

  const before = env.window.__aisq.state();
  assert.equal(before.ui.planDraft.decisions.archetypeDetail.value, "Real-time collaborative design studio");
  const add = buttonNamed(env.shadow(), "Add to Queue");
  add.click();
  add.click();
  await wait(180);
  const after = env.window.__aisq.state();
  assert.equal(after.chains.length, 1);
  assert.match(after.chains[0].preface, /Custom Product Category: Real-time collaborative design studio/);
  assert.equal(hostClicks, 0);
  assert.equal(after.eventLog.filter((entry) => entry.event === "PLAN_APPROVED").length, 1);
  assert.equal(after.eventLog.filter((entry) => entry.event === "PLAN_QUEUED").length, 1);
});

test("skipping a Draft Plan question records local skip and dismissal events", async (t) => {
  const env = await createEnvironment('<textarea placeholder="Describe an app and let Gemini do the rest"></textarea><button class="build-button" aria-disabled="true">Build</button>');
  t.after(() => env.close());
  env.window.__aisq.show();
  await wait(40);
  const draft = env.shadow().querySelector(".aisq-draft");
  draft.value = "Build app.";
  draft.dispatchEvent(new env.window.Event("input", { bubbles: true }));
  buttonNamed(env.shadow(), "Build with Wizard").click();
  await wait(80);
  const skip = env.shadow().querySelector(".aisq-plan-question-actions .aisq-button.ghost");
  assert.ok(skip);
  skip.click();
  await wait(50);
  const events = env.window.__aisq.state().eventLog.map((entry) => entry.event);
  assert.ok(events.includes("PLAN_QUESTION_SKIPPED"));
  assert.ok(events.includes("PLAN_QUESTION_DISMISSED"));
});

test("schema-v2 wizard answers migrate into the v3 Draft Plan without losing intent", async (t) => {
  const legacy = appState([], { pageKey: "app:test-app" });
  legacy.schemaVersion = 2;
  legacy.ui.specAnswers = { description: "Legacy dashboard", archetype: "dashboard", scale: "mvp" };
  const backend = { data: { aisqStateV2: legacy }, listeners: new Set() };
  const env = await createEnvironment('<textarea placeholder="Describe an app and let Gemini do the rest"></textarea><button class="build-button" aria-disabled="true">Build</button>', null, { storageBackend: backend });
  t.after(() => env.close());
  const state = env.window.__aisq.state();
  assert.equal(state.schemaVersion, 3);
  assert.equal(state.ui.planDraft.intent.source, "legacy");
  assert.equal(state.ui.planDraft.decisions.archetype.status, "confirmed");
});

test("JSON and ChatGPT extraction entry paths create proposed Draft Plans", async (t) => {
  const compact = [{ loaderData: { conversation: { serverResponse: { data: { linear_conversation: [
    { message: { author: { role: "user" }, content: { parts: ["Build a student dashboard"] } } },
    { message: { author: { role: "assistant" }, content: { parts: ["- Add a progress chart"] } } }
  ] } } } } }];
  const html = `streamController.enqueue(${JSON.stringify(JSON.stringify(compact))})`;
  const env = await createEnvironment('<textarea placeholder="Describe an app and let Gemini do the rest"></textarea><button class="build-button" aria-disabled="true">Build</button>', null, {
    sendMessage: (message, callback) => {
      if (message?.type === "AISQ_GET_TAB_ID") {
        callback?.({ tabId: "chatgpt-fixture" });
        return Promise.resolve({ tabId: "chatgpt-fixture" });
      }
      return Promise.resolve({ ok: true, html });
    }
  });
  t.after(() => env.close());
  env.window.__aisq.show();
  await wait(40);
  const draft = env.shadow().querySelector(".aisq-draft");
  draft.value = JSON.stringify({ name: "JSON starter", description: "A JSON-imported app", archetype: "ritual-based community workspace" });
  draft.dispatchEvent(new env.window.Event("input", { bubbles: true }));
  buttonNamed(env.shadow(), "Load as Template").click();
  await wait(60);
  assert.equal(env.window.__aisq.state().ui.planDraft.intent.source, "template");
  assert.equal(env.window.__aisq.state().ui.planDraft.decisions.name.status, "proposed");
  assert.deepEqual(Array.from(env.window.__aisq.state().ui.planDraft.unresolvedProfileKeys), ["archetype"]);
  const imported = env.window.AISQPlan.resolveDraft(env.window.__aisq.state().ui.planDraft, { specApi: env.window.AISQSpec });
  assert.ok(imported.requiredQuestionIds.includes("archetype"));
  assert.equal(imported.graph.readiness.queueEligible, false);
  assert.match(env.shadow().textContent, /Required: choose a safe value/);

  buttonNamed(env.shadow(), "← Back").click();
  await wait(40);
  const secondDraft = env.shadow().querySelector(".aisq-draft");
  secondDraft.value = "https://chatgpt.com/share/12345678901234567890";
  secondDraft.dispatchEvent(new env.window.Event("input", { bubbles: true }));
  buttonNamed(env.shadow(), "Fetch & Analyze ChatGPT Link").click();
  await wait(100);
  assert.equal(env.window.__aisq.state().ui.planDraft.intent.source, "extractor");
  assert.equal(env.window.__aisq.state().ui.planDraft.decisions.description.status, "proposed");
});

test("root-present reinjection stops the prior runtime before mounting exactly one replacement", async (t) => {
  const env = await createEnvironment('<textarea placeholder="Describe an app and let Gemini do the rest"></textarea><button class="build-button" aria-disabled="true">Build</button>');
  t.after(() => env.close());
  const firstRuntime = env.window.__AISQ_RUNTIME__;
  const firstRoot = env.root();
  assert.equal(env.listeners.length, 1, "initial runtime installs one message listener");
  env.inject();
  await wait(140);
  const replacementRoot = env.root();
  assert.equal(env.window.document.querySelectorAll("#aisq-extension-root").length, 1, "old root is removed before replacement mounts");
  assert.equal(firstRoot.isConnected, false, "prior runtime stopped and detached its root");
  assert.ok(env.window.__AISQ_RUNTIME__);
  assert.notEqual(env.window.__AISQ_RUNTIME__, firstRuntime, "replacement runtime is distinct");
  assert.notEqual(replacementRoot, firstRoot);
  assert.equal(env.listeners.length, 1, "prior message listener is removed before replacement listener is installed");
});

test("reinjection during async hydration cancels the provisional runtime", async (t) => {
  const env = await createEnvironment("", null, { storageGetDelayMs: 200 });
  t.after(() => env.close());
  const provisionalRuntime = env.window.__AISQ_RUNTIME__;
  assert.ok(provisionalRuntime, "content bootstrap exposes a stoppable provisional runtime");
  assert.equal(env.root(), null, "the first runtime is still hydrating");

  env.inject();
  await wait(520);

  assert.notEqual(env.window.__AISQ_RUNTIME__, provisionalRuntime);
  assert.equal(env.window.document.querySelectorAll("#aisq-extension-root").length, 1);
  assert.equal(env.listeners.length, 1, "only the replacement runtime registers a message listener");
});

test("route upgrade preserves both home and destination state when the destination is occupied", async (t) => {
  const homeChain = Core.makeChain("Home draft", [Core.normalizePrompt({ id: "home-prompt", text: "Keep the home draft.", status: "pending" })], "home");
  const targetChain = Core.makeChain("Saved app", [Core.normalizePrompt({ id: "target-prompt", text: "Keep the saved app.", status: "queued" })], "target");
  const state = appState([homeChain], {
    pageKey: "app:home",
    runner: {
      enabled: false,
      phase: Core.PHASES.PAUSED,
      activeChainId: homeChain.id,
      pendingPromptId: "home-prompt",
      boundPageKey: "app:home",
      ownerTabId: "home-owner",
      leaseUpdatedAt: Core.nowISO()
    }
  });
  state.projects["app:destination"] = { chains: [targetChain], stackOrder: [targetChain.id], selectedChainId: targetChain.id };
  state.runners["app:destination"] = { ...Core.defaultRunner(), phase: Core.PHASES.PAUSED, activeChainId: targetChain.id, lastError: "target sentinel" };

  const env = await createEnvironment("", state, { url: "https://aistudio.google.com/apps" });
  t.after(() => env.close());
  const ctx = env.window.AISQContext;
  ctx.leaseToken = "home-token";
  ctx.leaseKey = "app:home";
  ctx.state.runners["app:home"].ownerTabId = ctx.tabId;

  env.window.history.pushState({}, "", "/apps/destination");
  ctx.checkUrlUpgrade();
  await wait(120);

  const result = env.window.__aisq.state();
  assert.equal(result.projects["app:home"].chains[0].id, homeChain.id);
  assert.equal(result.projects["app:destination"].chains[0].id, targetChain.id);
  assert.equal(result.runners["app:home"].enabled, false);
  assert.equal(result.runners["app:home"].phase, Core.PHASES.PAUSED);
  assert.equal(result.runners["app:home"].ownerTabId, null);
  assert.equal(result.runners["app:home"].leaseUpdatedAt, null);
  assert.match(result.runners["app:home"].lastError, /already has saved state/i);
  assert.equal(result.runners["app:destination"].lastError, "target sentinel");
  assert.equal(ctx.leaseToken, null);
  assert.equal(ctx.leaseKey, null);
});

test("route upgrade moves the home project and runner together into an empty destination", async (t) => {
  const homeChain = Core.makeChain("New app", [Core.normalizePrompt({ id: "new-app-prompt", text: "Finish the new app.", status: "pending" })], "home");
  const state = appState([homeChain], {
    pageKey: "app:home",
    runner: {
      enabled: false,
      phase: Core.PHASES.PAUSED,
      activeChainId: homeChain.id,
      pendingPromptId: "new-app-prompt",
      boundPageKey: "app:home"
    }
  });
  const env = await createEnvironment("", state, { url: "https://aistudio.google.com/apps" });
  t.after(() => env.close());

  env.window.history.pushState({}, "", "/apps/new-app");
  env.window.AISQContext.checkUrlUpgrade();
  await wait(120);

  const result = env.window.__aisq.state();
  assert.equal(result.projects["app:home"], undefined);
  assert.equal(result.runners["app:home"], undefined);
  assert.equal(result.projects["app:new-app"].chains[0].id, homeChain.id);
  assert.equal(result.runners["app:new-app"].pendingPromptId, "new-app-prompt");
});

test("route conflict does not pause a home runner owned by another tab", async (t) => {
  const homeChain = Core.makeChain("Shared home run", [Core.normalizePrompt({ id: "shared-prompt", text: "Keep the shared run active.", status: "pending" })], "home");
  const targetChain = Core.makeChain("Existing destination", [Core.normalizePrompt({ id: "existing-prompt", text: "Keep the destination.", status: "queued" })], "target");
  const leaseStamp = Core.nowISO();
  const state = appState([homeChain], {
    pageKey: "app:home",
    runner: {
      enabled: true,
      phase: Core.PHASES.AWAITING,
      activeChainId: homeChain.id,
      pendingPromptId: "shared-prompt",
      boundPageKey: "app:home",
      ownerTabId: "other-tab",
      leaseUpdatedAt: leaseStamp
    }
  });
  state.projects["app:destination"] = { chains: [targetChain], stackOrder: [targetChain.id], selectedChainId: targetChain.id };
  state.runners["app:destination"] = { ...Core.defaultRunner(), phase: Core.PHASES.PAUSED, activeChainId: targetChain.id };
  const env = await createEnvironment("", state, { url: "https://aistudio.google.com/apps" });
  t.after(() => env.close());

  env.window.history.pushState({}, "", "/apps/destination");
  env.window.AISQContext.checkUrlUpgrade();

  const result = env.window.__aisq.state();
  assert.equal(result.runners["app:home"].enabled, true);
  assert.equal(result.runners["app:home"].phase, Core.PHASES.AWAITING);
  assert.equal(result.runners["app:home"].ownerTabId, "other-tab");
  assert.equal(result.runners["app:home"].leaseUpdatedAt, leaseStamp);
  assert.equal(result.projects["app:home"].chains[0].id, homeChain.id);
  assert.equal(result.projects["app:destination"].chains[0].id, targetChain.id);
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
    persistedPhaseAtClick = env.storage.aisqStateV3?.runner?.phase || null;
  });

  const shadow = env.shadow();
  shadow.getElementById("aisq-bubble").click();
  await wait(30);
  const splitter = shadow.querySelector(".aisq-select");
  splitter.value = "single";
  splitter.dispatchEvent(new env.window.Event("change", { bubbles: true }));
  const draft = shadow.querySelector(".aisq-draft");
  const promptText = "Build a small production test app with one page and no external integrations.";
  draft.value = promptText;
  draft.dispatchEvent(new env.window.Event("input", { bubbles: true }));
  buttonNamed(shadow, "Add to Queue").click();
  await wait(50);
  Array.from(shadow.querySelectorAll(".aisq-tab")).find((node) => node.textContent === "run").click();
  await wait(50);
  Array.from(shadow.querySelectorAll(".aisq-button")).find((node) => node.textContent.includes("Start")).click();
  await wait(1200);

  assert.equal(textarea.value, promptText);
  assert.equal(shadow.querySelector(".aisq-draft"), null, "queue transition replaces the build intake");
  assert.ok(inputEvents >= 1);
  assert.equal(buildClicks, 1);
  assert.equal(persistedPhaseAtClick, null, "project-scoped runners are persisted under the page-keyed runners map");
  assert.equal(env.storage.aisqStateV3.runners["app:test-app"].phase, Core.PHASES.AWAITING);
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
  const splitter = env.shadow().querySelector(".aisq-select");
  splitter.value = "single";
  splitter.dispatchEvent(new env.window.Event("change", { bubbles: true }));
  const draft = env.shadow().querySelector(".aisq-draft");
  draft.value = "Build a fixture that must never be clicked before durable state is committed.";
  draft.dispatchEvent(new env.window.Event("input", { bubbles: true }));
  buttonNamed(env.shadow(), "Add to Queue").click();
  Array.from(env.shadow().querySelectorAll(".aisq-tab")).find((node) => node.textContent === "run").click();
  await wait(50);
  Array.from(env.shadow().querySelectorAll(".aisq-button")).find((node) => node.textContent.includes("Start")).click();
  await wait(1200);

  assert.equal(clicks, 0);
  const state = env.window.__aisq.state();
  assert.equal(state.runner.enabled, false);
  assert.equal(state.runner.phase, Core.PHASES.PAUSED);
  assert.match(state.runner.lastError, /storage write failed/i);
});

test("hidden duplicate controls are ignored and a guided-tour dialog blocks submission", async (t) => {
  const chain = Core.makeChain("Blocked fixture", Core.parsePromptPack("Build a fixture only after the visible blocker is removed.", "single").prompts, "fixture");
  const state = appState([chain], { settings: { panelOpen: true, activeTab: "run" } });
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

  Array.from(env.shadow().querySelectorAll(".aisq-button")).find((node) => node.textContent.includes("Start")).click();
  await wait(700);
  assert.equal(buildClicks, 0);
  assert.equal(env.window.document.getElementById("visible-start").value, "");
  assert.equal(env.window.document.getElementById("hidden-editor").value, "");
  assert.match(env.window.__aisq.state().runner.lastHostState, /blocked/i);
});

test("a persisted start submission resumes in the editor and completes only on a new successful turn", async (t) => {
  const state = pendingState({ baselineTurnCount: 0 });
  state.runners["app:test-app"].boundPageKey = "app:home";
  const env = await createEnvironment(`
    <ms-code-assistant-chat>
      <div class="turn-container"><div class="turn"><div class="turn-header">Gemini 3.6 Flash Running for 1s</div><span>Assembling</span></div></div>
      <textarea placeholder="Make changes, add new features, ask for anything"></textarea>
      <button aria-label="Send" class="send-button disabled" aria-disabled="true"></button>
    </ms-code-assistant-chat>`, state);
  t.after(() => env.close());

  await wait(650);
  assert.equal(env.window.__aisq.state().runner.phase, Core.PHASES.RUNNING);
  assert.equal(env.window.__aisq.state().runner.boundPageKey, "app:test-app");
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
  const state = pendingState({ baselineTurnCount: 0, settings: { autoRun: false, panelOpen: true, activeTab: "run" } });
  state.projects["app:test-app"].chains[0].prompts.push({
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

  const resume = Array.from(env.shadow().querySelectorAll(".aisq-button")).find((node) => node.textContent.includes("Resume"));
  assert.ok(resume);
  resume.click();
  await wait(1200);
  assert.equal(env.window.document.getElementById("manual-composer").value, state.projects["app:test-app"].chains[0].prompts[1].text);
  assert.equal(sends, 1);
});

test("inspecting another chain cannot redirect a selected-only runner", async (t) => {
  const first = Core.makeChain("Pinned A", Core.parsePromptPack("Complete the pinned selected-only prompt.", "single").prompts, "A");
  const second = Core.makeChain("Inspected B", Core.parsePromptPack("This chain must remain queued and must not be submitted.", "single").prompts, "B");
  first.prompts[0].status = "pending";
  first.prompts[0].submittedAt = Core.nowISO();
  const state = appState([first, second], {
    settings: { panelOpen: true, activeTab: "prompts", settleMs: 30 },
    runner: {
    enabled: true,
    scope: "selected",
    scopeChainId: first.id,
    activeChainId: first.id,
    pendingPromptId: first.prompts[0].id,
    phase: Core.PHASES.AWAITING,
    baselineTurnCount: 0,
    submittedAt: Date.now()
    }
  });
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
  const first = Core.makeQueue("First queue", Core.parsePromptPack("First substantial standalone prompt.", "single").prompts, "first");
  const second = Core.makeQueue("Second queue", Core.parsePromptPack("Second substantial standalone prompt.", "single").prompts, "second");
  const state = appState([first, second], { settings: { panelOpen: true, activeTab: "prompts" } });
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
  const state = appState([], { settings: { panelOpen: true, activeTab: "settings" } });
  const env = await createEnvironment('<ms-code-assistant-chat><textarea placeholder="Make changes, add new features, ask for anything"></textarea><button aria-label="Send" aria-disabled="false"></button></ms-code-assistant-chat>', state);
  t.after(() => env.close());
  const settingLabels = Array.from(env.shadow().querySelectorAll("label"));
  const automatic = settingLabels.find((label) => /Continue automatically across the queue/.test(label.textContent)).querySelector('input[type="checkbox"]');
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
  assert.equal(env.storage.aisqStateV3.settings.failurePolicy, "skip_chain");
  assert.equal(env.window.document.querySelector('button[aria-label="Send"]').getAttribute("aria-disabled"), "false");
});

test("diagnostics download is permission-free and omits prompt text, labels, and chain names", async (t) => {
  const secretPrompt = "TOP_SECRET_PROMPT_TEXT that must never appear in diagnostics.";
  const chain = Core.makeChain("TOP_SECRET_CHAIN_NAME", Core.parsePromptPack(secretPrompt, "single").prompts, secretPrompt);
  chain.prompts[0].label = "TOP_SECRET_PROMPT_LABEL";
  const state = appState([chain], { settings: { panelOpen: true, activeTab: "run" } });
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

test("each paste creates one FIFO chain after the active runner chain", async (t) => {
  const active = Core.makeChain("Active", Core.parsePromptPack("Keep the active prompt intact.", "single").prompts, "active");
  active.prompts[0].status = "pending";
  const state = appState([active], {
    settings: { panelOpen: true, activeTab: "build" },
    runner: { enabled: true, phase: Core.PHASES.AWAITING, activeChainId: active.id, pendingPromptId: active.prompts[0].id, submittedAt: Date.now() }
  });
  const env = await createEnvironment('<textarea placeholder="Describe an app and let Gemini do the rest"></textarea><button class="build-button" aria-disabled="false">Build</button>', state);
  t.after(() => env.close());
  const paste = (text) => {
    const draft = env.shadow().querySelector(".aisq-draft");
    assert.ok(draft, "Build intake remains mounted for uninterrupted pastes");
    draft.value = text;
    draft.dispatchEvent(new env.window.Event("input", { bubbles: true, cancelable: true }));
    const splitter = env.shadow().querySelector(".aisq-select");
    splitter.value = "delimiter";
    splitter.dispatchEvent(new env.window.Event("change", { bubbles: true }));
    const addButton = buttonNamed(env.shadow(), "Add to Queue");
    assert.ok(addButton, "Add to Queue button exists");
    addButton.click();
  };
  paste("A1 substantial prompt that should remain in chain A.\n\n---\n\nA2 substantial prompt that should remain in chain A.");
  await wait(80);
  buttonNamed(env.shadow(), "build").click();
  await wait(40);
  paste("B1 substantial prompt that should remain in chain B.");
  await wait(80);
  const result = env.window.__aisq.state();
  assert.equal(result.chains.length, 3);
  assert.deepEqual(result.stackOrder, result.chains.map((chain) => chain.id));
  assert.equal(result.chains[1].prompts.length, 2);
  assert.equal(result.chains[2].prompts.length, 1);
  assert.equal(result.runner.enabled, true);
  assert.equal(result.runner.phase, Core.PHASES.AWAITING, "imports leave the active pending runner in its existing awaiting state");
  assert.equal(result.chains[0].id, active.id);
  assert.equal(result.settings.activeTab, "stack");
  assert.match(env.shadow().textContent, /Active/);
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
    return appState([chain], { settings: { panelOpen: true, activeTab: "run" } });
  };
  const body = '<textarea placeholder="Describe an app and let Gemini do the rest"></textarea><button class="build-button" aria-disabled="false">Build</button>';
  const first = await createEnvironment(body, queuedState(), { sendMessage: sender(11) });
  const second = await createEnvironment(body, queuedState(), { sendMessage: sender(22) });
  t.after(() => { first.close(); second.close(); });

  const clickNamed = (env, label) => Array.from(env.shadow().querySelectorAll(".aisq-button")).find((node) => node.textContent.includes(label))?.click();
  clickNamed(first, "Start");
  await first.window.__aisq.tick();
  await wait(120);
  clickNamed(second, "Start");
  await second.window.__aisq.tick();
  await wait(120);
  assert.equal(first.window.__aisq.state().runner.enabled, true);
  assert.equal(first.window.__aisq.state().runner.ownerTabId, "11");
  assert.equal(second.window.__aisq.state().runner.enabled, false);
  assert.match(second.window.__aisq.state().runner.lastError, /another AI Studio tab/i);

  clickNamed(first, "Pause");
  await first.window.__aisq.tick();
  await wait(80);
  clickNamed(second, "Start");
  await second.window.__aisq.tick();
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
  const state = appState([chain], { settings: { panelOpen: true, activeTab: "run" } });
  const backend = { data: { aisqStateV3: structuredClone(state) }, listeners: new Set() };
  const body = '<textarea placeholder="Describe an app and let Gemini do the rest"></textarea><button class="build-button" aria-disabled="false">Build</button>';
  const first = await createEnvironment(body, null, { storageBackend: backend, sendMessage: sender(11) });
  const second = await createEnvironment(body, null, { storageBackend: backend, sendMessage: sender(22) });
  let firstClosed = false;
  t.after(() => { if (!firstClosed) first.close(); second.close(); });
  const clickNamed = (env, label) => Array.from(env.shadow().querySelectorAll(".aisq-button")).find((node) => node.textContent.includes(label))?.click();

  clickNamed(first, "Start");
  await first.window.__aisq.tick();
  await wait(850);
  assert.equal(first.window.__aisq.state().runner.boundPageKey, "app:test-app");
  clickNamed(first, "Pause");
  await first.window.__aisq.tick();
  await wait(150);
  assert.equal(first.window.__aisq.state().runner.enabled, false);
  assert.equal(first.window.__aisq.state().runner.ownerTabId, "11");
  assert.equal(releases, 0, "manual pause retains the pending lease");
  assert.equal(Array.from(second.shadow().querySelectorAll(".aisq-button")).some((node) => node.textContent.includes("Pause")), false);
  assert.ok(Array.from(second.shadow().querySelectorAll(".aisq-button")).some((node) => node.textContent.includes("Recover")));

  clickNamed(second, "Recover");
  await second.window.__aisq.tick();
  await wait(120);
  assert.match(second.window.__aisq.state().runner.lastError, /original runner tab is still active/i);
  assert.equal(second.window.__aisq.state().runner.ownerTabId, "11");

  first.close();
  firstClosed = true;
  await wait(80);
  assert.equal(releases, 1);
  clickNamed(second, "Recover");
  await second.window.__aisq.tick();
  await wait(180);
  assert.equal(second.window.__aisq.state().runner.enabled, true);
  assert.equal(second.window.__aisq.state().runner.ownerTabId, "22");
  assert.ok(second.window.__aisq.state().history.some((entry) => entry.kind === "runner_recovered"));
});

test("pending recovery refuses a different AI Studio app before acquiring a lease", async (t) => {
  const chain = Core.makeChain("Original app", [Core.normalizePrompt({ id: "bound-prompt", text: "A bound pending prompt.", status: "pending" })], "fixture");
  const state = appState([chain], {
    pageKey: "app:different-app",
    settings: { panelOpen: true, activeTab: "run" },
    runner: { enabled: false, phase: Core.PHASES.PAUSED, activeChainId: chain.id, pendingPromptId: "bound-prompt", ownerTabId: "11", boundPageKey: "app:original-app" }
  });
  let acquireCalls = 0;
  const env = await createEnvironment("", state, {
    url: "https://aistudio.google.com/app/apps/different-app",
    sendMessage(message, callback) {
      if (message.type === "AISQ_GET_TAB_ID") queueMicrotask(() => callback?.({ tabId: 22 }));
      else if (message.type === "AISQ_LEASE_ACQUIRE") { acquireCalls += 1; queueMicrotask(() => callback?.({ ok: true, tabId: 22, token: "should-not-be-used" })); }
    }
  });
  t.after(() => env.close());
  const recover = Array.from(env.shadow().querySelectorAll(".aisq-button")).find((node) => node.textContent.includes("Recover"));
  assert.ok(recover);
  recover.click();
  await env.window.__aisq.tick();
  await wait(100);
  assert.equal(acquireCalls, 0);
  assert.match(env.window.__aisq.state().runner.lastError, /belongs to app:original-app/i);
  assert.equal(env.window.__aisq.state().runner.ownerTabId, "11");
});

test("sequential queue edits synchronize across open AI Studio tabs", async (t) => {
  const initial = appState();
  const backend = { data: { aisqStateV3: structuredClone(initial) }, listeners: new Set() };
  const first = await createEnvironment("", null, { storageBackend: backend });
  const second = await createEnvironment("", null, { storageBackend: backend });
  t.after(() => { first.close(); second.close(); });

  first.window.__aisq.importText("A synchronized production prompt from the first tab.", "single", { name: "Shared chain" });
  await wait(180);
  assert.equal(second.window.__aisq.state().chains.length, 1);
  assert.equal(second.window.__aisq.state().chains[0].name, "Shared chain");

  second.window.__aisq.show();
  await wait(80);
  Array.from(second.shadow().querySelectorAll(".aisq-tab")).find((node) => node.textContent.startsWith("prompts")).click();
  await wait(80);
  const name = second.shadow().querySelector('.aisq-field input.aisq-input');
  assert.ok(name);
  name.value = "Renamed in tab two";
  name.dispatchEvent(new second.window.Event("change", { bubbles: true }));
  await wait(180);
  assert.equal(first.window.__aisq.state().chains[0].name, "Renamed in tab two");
});

test("a stale tab cannot overwrite a newer queue revision", async (t) => {
  const initial = appState();
  const backend = { data: { aisqStateV3: structuredClone(initial) }, listeners: new Set() };
  const first = await createEnvironment("", null, { storageBackend: backend });
  const second = await createEnvironment("", null, { storageBackend: backend });
  t.after(() => { first.close(); second.close(); });
  const secondListener = Array.from(backend.listeners)[1];
  backend.listeners.delete(secondListener);

  first.window.__aisq.importText("Authoritative chain created in tab one.", "single", { name: "Authoritative" });
  await wait(160);
  assert.equal(backend.data.aisqStateV3.projects["app:test-app"].chains.length, 1);

  second.window.__aisq.importText("A stale conflicting chain from tab two.", "single", { name: "Stale conflict" });
  await wait(180);
  assert.equal(backend.data.aisqStateV3.projects["app:test-app"].chains.length, 1);
  assert.equal(backend.data.aisqStateV3.projects["app:test-app"].chains[0].name, "Authoritative");
  assert.equal(second.window.__aisq.state().chains[0].name, "Authoritative");
  assert.match(second.window.__aisq.state().runner.lastError, /newer queue change/i);
});
