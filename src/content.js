(function initAISQContent() {
  "use strict";

  const ROOT_ID = "aisq-extension-root";
  if (globalThis.__AISQ_CONTENT_LOADED__ && document.getElementById(ROOT_ID)) return;
  if (globalThis.__AISQ_CONTENT_LOADED__) globalThis.__AISQ_RUNTIME__?.stop?.();
  globalThis.__AISQ_CONTENT_LOADED__ = true;

  const Core = globalThis.AISQCore;
  if (!Core) return;

  const STORAGE_KEY = "aisqStateV2";
  const LEGACY_STORAGE_KEY = "aisqStateV1";
  const TICK_MS = 500;
  const LEASE_MS = 20_000;
  const PHASES = Core.PHASES;
  const EXTENSION_VERSION = chrome.runtime.getManifest?.().version || "dev";
  const clone = globalThis.structuredClone || ((v) => JSON.parse(JSON.stringify(v)));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const textOf = (node) => String(node?.textContent || "").replace(/\s+/g, " ").trim();

  const adapter = globalThis.AISQAdapter ? new globalThis.AISQAdapter.StorageAdapter(chrome.storage) : {
    get: async (k) => { const r = await chrome.storage.local.get(k); return r[k]; },
    set: async (k, v) => { await chrome.storage.local.set({ [k]: v }); },
    onChanged: (cb) => {
      const listener = (changes, areaName) => cb(changes, areaName);
      chrome.storage.onChanged?.addListener(listener);
      return () => chrome.storage.onChanged?.removeListener(listener);
    }
  };

  let state = Core.defaultState();
  let persistedRevision = 0;
  let rootHost = null;
  let shadow = null;
  let panel = null;
  let statusLine = null;
  let tickBusy = false;
  let saveTimer = null;
  let saveQueue = Promise.resolve();
  let tickIntervalId = null;
  let runtimeMessageListener = null;
  let storageChangeListener = null;
  let renderQueued = false;
  let lastHostSignature = "";
  let exportStep = null;
  let tabId = `local-${Core.uid("tab")}`;
  let leaseToken = null;
  let lastLeaseHeartbeatAt = 0;
  let runnerOwnedByOtherTab = false;
  const clickedOptInControls = new WeakSet();

  globalThis.AISQContext = {
    get state() { return state; },
    set state(v) { state = v; },
    get persistedRevision() { return persistedRevision; },
    set persistedRevision(v) { persistedRevision = v; },
    get rootHost() { return rootHost; },
    set rootHost(v) { rootHost = v; },
    get shadow() { return shadow; },
    set shadow(v) { shadow = v; },
    get panel() { return panel; },
    set panel(v) { panel = v; },
    get statusLine() { return statusLine; },
    set statusLine(v) { statusLine = v; },
    get tickBusy() { return tickBusy; },
    set tickBusy(v) { tickBusy = v; },
    get saveTimer() { return saveTimer; },
    set saveTimer(v) { saveTimer = v; },
    get saveQueue() { return saveQueue; },
    set saveQueue(v) { saveQueue = v; },
    get tickIntervalId() { return tickIntervalId; },
    set tickIntervalId(v) { tickIntervalId = v; },
    get renderQueued() { return renderQueued; },
    set renderQueued(v) { renderQueued = v; },
    get lastHostSignature() { return lastHostSignature; },
    set lastHostSignature(v) { lastHostSignature = v; },
    get exportStep() { return exportStep; },
    set exportStep(v) { exportStep = v; },
    get tabId() { return tabId; },
    set tabId(v) { tabId = v; },
    get leaseToken() { return leaseToken; },
    set leaseToken(v) { leaseToken = v; },
    get lastLeaseHeartbeatAt() { return lastLeaseHeartbeatAt; },
    set lastLeaseHeartbeatAt(v) { lastLeaseHeartbeatAt = v; },
    get runnerOwnedByOtherTab() { return runnerOwnedByOtherTab; },
    set runnerOwnedByOtherTab(v) { runnerOwnedByOtherTab = v; },
    clickedOptInControls,
    
    // Core functions
    addHistory: function(...args) { return addHistory(...args); },
    enqueueSave: function(...args) { return enqueueSave(...args); },
    touchState: function(...args) { return touchState(...args); },
    scheduleSave: function(...args) { return scheduleSave(...args); },
    mutate: function(...args) { return mutate(...args); },
    command: function(...args) { return command(...args); },
    requestRender: function(...args) { return requestRender(...args); },
    selectedChain: function(...args) { return selectedChain(...args); },
    runnerChain: function(...args) { return runnerChain(...args); },
    runnerPrompt: function(...args) { return runnerPrompt(...args); },
    currentPageKey: function(...args) { return currentPageKey(...args); },
    isAppsListUpgrade: function(...args) { return isAppsListUpgrade(...args); },
    EXTENSION_VERSION,
    pageMatchesBinding: function(...args) { return pageMatchesBinding(...args); },
    saveNow: function(...args) { return saveNow(...args); },
    textOf: function(...args) { return textOf(...args); },
    clone: function(...args) { return clone(...args); },
    sleep: function(...args) { return sleep(...args); }
  };
  const ctx = globalThis.AISQContext;





  function selectedChain() { return Core.getSelectedChain(state); }
  function runnerChain() { return Core.getRunnerChain(state); }
  function runnerPrompt() { return Core.getRunnerPrompt(state); }

  function currentPageKey() {
    const parts = location.pathname.split("/").filter(Boolean);
    // /apps/<id>  → /apps/<id>
    if (parts[0] === "apps") return `/${parts.slice(0, 2).join("/")}`;
    // /app/apps/<id>  → /app/apps/<id>
    if (parts[0] === "app" && parts[1] === "apps") return `/${parts.slice(0, 3).join("/")}`;
    return location.pathname || "/";
  }

  /** True if the bound key is a generic apps-list page and the current key is a specific app under it. */
  function isAppsListUpgrade(boundKey, currentKey) {
    return /\/apps$/.test(boundKey) && currentKey.startsWith(boundKey + "/");
  }

  function pageMatchesBinding() {
    if (!state.runner.boundPageKey) return true;
    const current = currentPageKey();
    return state.runner.boundPageKey === current || isAppsListUpgrade(state.runner.boundPageKey, current);
  }

  function addHistory(kind, message, data = null) {
    state.history.push({ at: Core.nowISO(), kind, message, data });
    if (state.history.length > 350) state.history = state.history.slice(-300);
  }

  function touchState() {
    state.revision = Number(state.revision || 0) + 1;
    state.updatedAt = Core.nowISO();
    state.runner.updatedAt = state.updatedAt;
  }

  function compareStateVersion(left, right) {
    const revisionDifference = Number(left?.revision || 0) - Number(right?.revision || 0);
    if (revisionDifference) return revisionDifference;
    return String(left?.updatedAt || "").localeCompare(String(right?.updatedAt || ""));
  }

  function acceptStoredState(raw) {
    const incoming = Core.migrateState(raw);
    if (compareStateVersion(incoming, state) <= 0) return false;
    state = incoming;
    persistedRevision = Number(incoming.revision || 0);
    runnerOwnedByOtherTab = !!(state.runner.enabled && state.runner.ownerTabId && state.runner.ownerTabId !== tabId);
    if (state.runner.ownerTabId !== tabId) leaseToken = null;
    requestRender();
    return true;
  }

  function enqueueSave() {
    const operation = async () => {
      Core.syncLegacyAliases(state);
      const current = await adapter.get(STORAGE_KEY);
      const stored = current ? Core.migrateState(current) : null;
      if (stored && Number(stored.revision || 0) > persistedRevision) {
        if (compareStateVersion(stored, state) > 0) acceptStoredState(stored);
        else {
          state = stored;
          persistedRevision = Number(stored.revision || 0);
          state.runner.lastError = "A newer queue change from another tab was kept; repeat your last edit on the synchronized state";
          runnerOwnedByOtherTab = !!(state.runner.enabled && state.runner.ownerTabId && state.runner.ownerTabId !== tabId);
          requestRender();
        }
        return false;
      }
      const snapshot = clone(state);
      await adapter.set(STORAGE_KEY, snapshot);
      if (!globalThis.__AISQ_LEGACY_WRITTEN__) {
        await adapter.set(LEGACY_STORAGE_KEY, snapshot);
        globalThis.__AISQ_LEGACY_WRITTEN__ = true;
      }
      persistedRevision = Number(snapshot.revision || 0);
      return true;
    };
    const result = saveQueue.then(operation, operation);
    saveQueue = result.catch(() => {});
    return result;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void enqueueSave().catch(() => {});
    }, 80);
  }

  async function saveNow() {
    clearTimeout(saveTimer);
    return enqueueSave();
  }

  function mutate(mutator, render = true) {
    mutator(state);
    Core.syncLegacyAliases(state);
    touchState();
    scheduleSave();
    if (render) requestRender();
  }

  function command(type, payload = {}, options = {}) {
    const ownerOnlyMutation = (type === "SKIP_PROMPT" && (!payload.promptId || payload.promptId === state.runner.pendingPromptId)) ||
      (type === "SKIP_CHAIN" && (!payload.chainId || payload.chainId === state.runner.activeChainId));
    if (ownerOnlyMutation && state.runner.enabled && !leaseToken) {
      const error = "Only the owner tab can change the running prompt or chain";
      state.runner.lastError = error;
      touchState();
      scheduleSave();
      requestRender();
      return { ok: false, error };
    }
    const result = Core.applyCommand(state, { type, payload });
    if (!result.ok) {
      if (options.showError !== false) addHistory("command_rejected", result.error, { type, payload });
      if (options.showError !== false) {
        state.runner.lastError = result.error;
        touchState();
        scheduleSave();
        requestRender();
      }
      return result;
    }
    if (options.history) addHistory(options.history.kind, options.history.message, options.history.data || null);
    if (!state.runner.enabled && state.runner.phase === PHASES.PAUSED) ctx.releaseRunnerLease();
    scheduleSave();
    requestRender();
    return result;
  }

  let lastRenderedStateKey = "";
  function stateRenderKey() {
    return `${state.revision}_${state.settings.panelOpen}_${state.settings.isMinimized}_${state.settings.activeTab}_${state.runner.phase}_${state.runner.enabled}_${state.runner.pendingPromptId}_${state.runner.lastError}_${state.selectedChainId}_${exportStep}_${runnerOwnedByOtherTab}`;
  }

  function requestRender(force = false) {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      const key = stateRenderKey();
      if (!force && key === lastRenderedStateKey) {
        if (statusLine) statusLine.textContent = `${state.runner.phase.replaceAll("_", " ")} · ${state.runner.lastHostState || "ready"}`;
        const bubble = shadow?.getElementById("aisq-bubble");
        if (bubble) bubble.classList.toggle("running", state.runner.enabled);
        const topStatus = shadow?.querySelector(".aisq-top-status");
        if (topStatus) topStatus.textContent = `${state.runner.phase.replaceAll("_", " ")} · ${state.runner.lastHostState || "ready"}`;
        return;
      }
      lastRenderedStateKey = key;
      const active = shadow?.activeElement;
      if (!active || !active.matches?.("input, textarea, select")) render();
    });
  }


  function render() {
    if (!panel) return;
    panel.hidden = !state.settings.panelOpen;
    const bubble = shadow.getElementById("aisq-bubble");
    if (bubble) bubble.classList.toggle("running", state.runner.enabled);
    if (statusLine) statusLine.textContent = `${state.runner.phase.replaceAll("_", " ")} · ${state.runner.lastHostState || "ready"}`;
    if (panel.hidden) return;
    
    if (state.settings.isMinimized) panel.classList.add("aisq-minimized");
    else panel.classList.remove("aisq-minimized");

    const header = ctx.el("header", { className: "aisq-header" }, [
      ctx.el("div", {}, [
        ctx.el("strong", { text: "Copilot" }), 
        ctx.el("div", { className: "aisq-subtitle", text: "Google AI Studio Apps · stacked chains" })
      ]), 
      ctx.el("div", { className: "aisq-window-controls" }, [
        ctx.button(state.settings.isMinimized ? "◱" : "—", () => mutate(() => { state.settings.isMinimized = !state.settings.isMinimized; }), "icon", state.settings.isMinimized ? "Maximize Copilot" : "Minimize Copilot"),
        ctx.button("×", () => mutate(() => { state.settings.panelOpen = false; }), "icon", "Close Copilot")
      ])
    ]);
    
    let promptBadge = "";
    const selectedChain = Core.getSelectedChain(state);
    if (selectedChain && selectedChain.prompts.length > 0) {
      let currentIndex = selectedChain.prompts.findIndex(p => ["pending", "queued", "error"].includes(p.status));
      if (currentIndex === -1) currentIndex = selectedChain.prompts.length;
      const displayIndex = currentIndex < selectedChain.prompts.length ? currentIndex + 1 : selectedChain.prompts.length;
      promptBadge = ` (${displayIndex}/${selectedChain.prompts.length})`;
    }

    const tabs = ctx.el("nav", { className: "aisq-tabs", role: "tablist", ariaLabel: "Copilot sections" });
    for (const tab of ["build", "stack", "prompts", "run", "settings"]) tabs.append(ctx.el("button", { className: `aisq-tab ${state.settings.activeTab === tab ? "active" : ""}`, type: "button", text: tab === "prompts" ? `prompts${promptBadge}` : tab, role: "tab", ariaSelected: state.settings.activeTab === tab, on: { click: () => mutate(() => { state.settings.activeTab = tab; }) } }));
    const body = state.settings.activeTab === "build" ? ctx.renderBuild() : state.settings.activeTab === "stack" ? ctx.renderStack() : state.settings.activeTab === "prompts" ? ctx.renderPrompts() : state.settings.activeTab === "run" ? ctx.renderRun() : ctx.renderSettings();
    const alert = state.runner.lastError && state.settings.activeTab !== "run" ? ctx.el("div", { className: "aisq-error aisq-global-error", text: state.runner.lastError, role: "alert" }) : null;
    const scrollActions = ctx.el("div", { className: "aisq-scroll-actions" }, [
      ctx.el("button", { className: "aisq-float-btn", text: "▲", title: "Scroll to top", type: "button", on: { click: () => panel.scrollTo({ top: 0, behavior: "smooth" }) } }),
      ctx.el("button", { className: "aisq-float-btn", text: "▼", title: "Scroll to bottom", type: "button", on: { click: () => panel.scrollTo({ top: panel.scrollHeight, behavior: "smooth" }) } })
    ]);
    const topRunControls = ctx.renderTopRunControls();
    panel.replaceChildren(header, tabs, topRunControls, alert, body, scrollActions, ctx.el("footer", { className: "aisq-footer" }, [ctx.el("span", { text: `v${EXTENSION_VERSION} · ` }), statusLine]));
  }

  function installStyles() {
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; color-scheme: dark; }
      * { box-sizing: border-box; }
      button, input, textarea, select { font: inherit; }
      button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible { outline:3px solid #b9a9ff; outline-offset:2px; }
      #aisq-bubble { position:fixed; right:18px; bottom:18px; z-index:2147483647; width:50px; height:50px; border:1px solid #ffffff33; border-radius:18px; background:linear-gradient(145deg,#7357ff,#4b2acb); color:#fff; font:800 13px/1 system-ui,sans-serif; box-shadow:0 14px 40px #0008; cursor:pointer; }
      #aisq-bubble.running::after { content:""; position:absolute; right:5px; top:5px; width:9px; height:9px; border-radius:50%; background:#55e69b; box-shadow:0 0 0 3px #173c2c; }
      #aisq-dl-bubble { position:fixed; right:74px; bottom:18px; z-index:2147483647; width:50px; height:50px; border:1px solid #ffffff33; border-radius:18px; background:linear-gradient(145deg,#333,#111); color:#fff; font:800 20px/1 system-ui,sans-serif; box-shadow:0 14px 40px #0008; cursor:pointer; display:none; }
      #aisq-dl-bubble:hover { background:linear-gradient(145deg,#444,#222); }
      .aisq-badge { position:fixed; z-index:2147483647; padding:6px 10px; border-radius:999px; font:12px/1.2 system-ui,-apple-system,sans-serif; background:#000d; color:#fff; box-shadow:0 8px 24px #0004; pointer-events:none; }
      #aisq-panel { position:fixed; right:18px; bottom:80px; z-index:2147483647; width:min(500px,calc(100vw - 24px)); max-height:min(760px,calc(100vh - 100px)); overflow:auto; border:1px solid #ffffff26; border-radius:18px; background:#15151a; color:#f5f4fa; font:13px/1.45 system-ui,-apple-system,sans-serif; box-shadow:0 24px 80px #000b; }
      #aisq-panel[hidden] { display:none; }
      .aisq-header { position:sticky; top:0; z-index:2; display:flex; align-items:center; justify-content:space-between; padding:15px 16px 11px; background:#15151af2; backdrop-filter:blur(12px); }
      .aisq-subtitle,.aisq-help,.aisq-copy { color:#a9a6b4; }
      .aisq-subtitle { font-size:11px; }
      .aisq-tabs { position:sticky; top:61px; z-index:2; display:grid; grid-template-columns:repeat(5,1fr); padding:0 10px 10px; gap:4px; background:#15151af2; }
      .aisq-tab { border:0; border-radius:9px; padding:7px 4px; background:transparent; color:#aaa6b7; text-transform:capitalize; cursor:pointer; }
      .aisq-tab.active { background:#6d4aff; color:white; }
      .aisq-top-run-controls { position:sticky; top:99px; z-index:2; display:flex; gap:8px; padding:10px 16px; background:#1e1d24f2; backdrop-filter:blur(12px); border-bottom:1px solid #ffffff12; align-items:center; flex-wrap:wrap; box-shadow:0 4px 14px rgba(0,0,0,0.35); border-radius:0 0 16px 16px; }
      .aisq-top-status { margin-left:auto; display:flex; align-items:center; gap:6px; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:240px; color:#b9a9ff; font-weight:500; }
      .aisq-btn-highlight { background:linear-gradient(135deg,#7357ff,#5835eb) !important; border-color:#8e76ff !important; color:#fff !important; box-shadow:0 2px 8px rgba(115,87,255,0.35); font-weight:600; }
      .aisq-btn-highlight:hover { background:linear-gradient(135deg,#856bff,#6844f5) !important; }
      .aisq-btn-pause { background:rgba(246,192,50,0.12) !important; border-color:rgba(246,192,50,0.4) !important; color:#fde047 !important; font-weight:600; }
      .aisq-btn-pause:hover { background:rgba(246,192,50,0.22) !important; }
      .aisq-btn-stop { background:rgba(255,109,105,0.12) !important; border-color:rgba(255,109,105,0.45) !important; color:#fca5a5 !important; font-weight:600; }
      .aisq-btn-stop:hover { background:rgba(255,109,105,0.25) !important; }
      .aisq-host-badge { display:inline-flex; align-items:center; gap:4px; padding:2px 7px; border-radius:999px; font-size:10px; font-weight:600; letter-spacing:0.2px; }
      .aisq-host-badge::before { content:""; width:6px; height:6px; border-radius:50%; display:inline-block; }
      .aisq-host-editor { background:rgba(85,230,155,0.1); color:#55e69b; border:1px solid rgba(85,230,155,0.25); }
      .aisq-host-editor::before { background:#55e69b; box-shadow:0 0 6px #55e69b; }
      .aisq-host-start { background:rgba(246,192,50,0.1); color:#fde047; border:1px solid rgba(246,192,50,0.25); }
      .aisq-host-start::before { background:#fde047; }
      .aisq-host-unsupported { background:rgba(255,255,255,0.05); color:#9995a5; border:1px solid rgba(255,255,255,0.1); }
      .aisq-host-unsupported::before { background:#9995a5; }
      .aisq-host-busy { background:rgba(185,169,255,0.15); color:#d8ceff; border:1px solid rgba(185,169,255,0.35); animation:aisq-pulse 1.5s infinite ease-in-out; }
      .aisq-host-busy::before { background:#b9a9ff; box-shadow:0 0 8px #b9a9ff; }
      #aisq-panel.aisq-minimized { width: auto; max-width: 480px; min-width: 320px; bottom: 80px; }
      #aisq-panel.aisq-minimized .aisq-tabs,
      #aisq-panel.aisq-minimized .aisq-global-error,
      #aisq-panel.aisq-minimized .aisq-panel > div:not(.aisq-top-run-controls),
      #aisq-panel.aisq-minimized .aisq-scroll-actions,
      #aisq-panel.aisq-minimized .aisq-footer,
      #aisq-panel.aisq-minimized .aisq-section { display: none !important; }
      #aisq-panel.aisq-minimized .aisq-top-run-controls { border-bottom: none; border-radius: 0 0 18px 18px; top: 61px; }
      .aisq-window-controls { display: flex; gap: 4px; align-items: center; }
      .aisq-section { display:flex; flex-direction:column; gap:12px; padding:14px 16px 18px; }
      .aisq-field { display:flex; flex-direction:column; gap:5px; }
      .aisq-label { font-weight:650; }
      .aisq-input,.aisq-draft,.aisq-prompt-editor,.aisq-select { width:100%; border:1px solid #ffffff24; border-radius:10px; background:#222128; color:#f5f4fa; padding:9px 10px; outline:none; }
      .aisq-input:focus,.aisq-draft:focus,.aisq-prompt-editor:focus,.aisq-select:focus { border-color:#8067ff; box-shadow:0 0 0 3px #7357ff30; }
      .aisq-draft { min-height:160px; resize:vertical; }
      .aisq-prompt-editor { min-height:92px; resize:vertical; }
      .aisq-prompt-editor:disabled { opacity:.68; }
      .aisq-actions { display:flex; flex-wrap:wrap; gap:8px; }
      .aisq-button { border:1px solid #ffffff24; border-radius:9px; padding:7px 11px; background:#2b2931; color:#f5f4fa; cursor:pointer; }
      .aisq-button:hover { background:#383540; }
      .aisq-button:disabled { opacity:.4; cursor:not-allowed; }
      .aisq-button.primary { border-color:#8067ff; background:#6d4aff; }
      .aisq-button.ghost { background:transparent; }
      .aisq-button.danger { color:#ffaba9; }
      .aisq-button.icon { padding:4px 9px; font-size:20px; line-height:1; }
      .aisq-meter { padding:9px 10px; border-radius:9px; background:#24222b; color:#cfcbd9; }
      .aisq-stack-title { display:flex; justify-content:space-between; align-items:center; }
      .aisq-stack-list { display:flex; flex-direction:column; gap:7px; }
      .aisq-chain-card { border:1px solid #ffffff16; border-radius:11px; background:#1d1c22; padding:8px; transition:border-color 0.2s, box-shadow 0.2s; }
      .aisq-chain-card.selected { border-color:#8067ff; box-shadow:0 0 0 2px #7357ff24; }
      .aisq-chain-card.locked { border-color:#a88cff; }
      .aisq-chain-card.aisq-highlight-running { border-color:#55e69b; box-shadow:0 0 0 2px rgba(85,230,155,0.2); }
      .aisq-chain-card.aisq-highlight-paused { border-color:#f6c032; box-shadow:0 0 0 2px rgba(246,192,50,0.2); }
      .aisq-chain-head { display:grid; grid-template-columns:minmax(0,1fr) auto auto auto auto auto auto auto; gap:5px; align-items:center; }
      .aisq-chain-head .aisq-button:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:left; }
      .aisq-prompt-list { display:flex; flex-direction:column; gap:10px; }
      .aisq-prompt { border-left:3px solid #6b6874; border-radius:10px; background:#1d1c22; padding:10px; transition:background 0.2s, border-color 0.2s; }
      .aisq-prompt[open] .aisq-prompt-head { margin-bottom: 8px; border-bottom: 1px solid #333; padding-bottom: 8px; }
      .aisq-prompt.aisq-complete { border-left-color:#4ee09a; }
      .aisq-prompt.aisq-pending { border-left-color:#a88cff; }
      .aisq-prompt.aisq-error { border-left-color:#ff6d69; }
      .aisq-prompt.aisq-skipped { border-left-color:#89838f; opacity:.7; }
      .aisq-prompt.aisq-highlight-running { border-left-color:#55e69b; background:rgba(85,230,155,0.05); }
      .aisq-prompt.aisq-highlight-paused { border-left-color:#f6c032; background:rgba(246,192,50,0.05); }
      .aisq-preface-card { border-left-color:#7357ff; background:#1a1922; }
      .aisq-preface-editor { min-height:72px; }
      .aisq-preface-badge { font-size:11px; padding:2px 7px; border-radius:999px; background:#2b2838; color:#b9a9ff; font-weight:normal; margin-left:4px; }
      .aisq-preface-badge.empty { background:#24222c; color:#85818f; }
      .aisq-btn-extract { color:#c4b5fd !important; border-color:rgba(115,87,255,0.4) !important; background:rgba(115,87,255,0.12) !important; font-size:11px !important; }
      .aisq-btn-extract:hover { background:rgba(115,87,255,0.25) !important; color:#fff !important; }
      .aisq-move-intro-btn { font-size:11px !important; margin-bottom:6px; color:#a78bfa !important; border:1px dashed rgba(115,87,255,0.3) !important; padding:4px 8px !important; align-self:flex-start; }
      .aisq-move-intro-btn:hover { background:rgba(115,87,255,0.15) !important; color:#fff !important; }
      .aisq-preface-on { color:#55e69b !important; border-color:rgba(85,230,155,0.4) !important; background:rgba(85,230,155,0.08) !important; }
      .aisq-preface-off { color:#85818f !important; border-color:rgba(255,255,255,0.1) !important; }
      .aisq-preface-disabled { color:#6b6777 !important; border-color:rgba(255,255,255,0.06) !important; opacity:0.75; }
      .aisq-preface-attached-banner { display:flex; align-items:center; gap:6px; padding:4px 8px; margin-bottom:6px; background:rgba(115,87,255,0.08); border:1px dashed rgba(115,87,255,0.3); border-radius:6px; font-size:11px; color:#c4b5fd; line-height:1.3; }
      .aisq-preface-attached-tag { font-weight:600; white-space:nowrap; color:#a78bfa; font-size:10px; text-transform:uppercase; letter-spacing:0.3px; }
      .aisq-preface-attached-text { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#b9a9ff; opacity:0.85; }
      .aisq-preface-detached-banner { display:flex; align-items:center; gap:6px; padding:5px 9px; margin-bottom:7px; background:rgba(255,255,255,0.03); border:1px dashed rgba(255,255,255,0.12); border-radius:7px; font-size:11px; color:#948fa3; }
      .aisq-prompt-head { display:flex; gap:5px; align-items:center; cursor:pointer; list-style:none; }
      .aisq-prompt-head::-webkit-details-marker { display:none; }
      .aisq-prompt-head strong { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
      .aisq-index { flex:0 0 24px; display:grid; place-items:center; height:24px; border-radius:7px; background:#302d39; user-select:none; cursor:pointer; transition:background 0.15s, transform 0.1s, box-shadow 0.15s; }
      .aisq-index:hover { background:#4f4863; color:#fff; transform:scale(1.1); box-shadow:0 0 8px rgba(115,87,255,0.4); }
      .aisq-status { color:#aaa6b7; font-size:11px; }
      .aisq-error { padding:9px 10px; border:1px solid #ff6d6948; border-radius:9px; background:#5a25273d; color:#ffc0bd; }
      .aisq-global-error { margin:0 16px; }
      .aisq-run-card { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:9px; }
      .aisq-phase { border-radius:999px; padding:4px 8px; background:#34313d; color:#d6d1e2; font-size:11px; text-transform:capitalize; }
      .aisq-phase-running,.aisq-phase-awaiting_start,.aisq-phase-submitting { background:#452f91; color:#e1d8ff; animation:aisq-pulse 1.8s infinite ease-in-out; }
      .aisq-phase-done { background:#174a35; color:#a4f5ce; }
      @keyframes aisq-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.65; } }
      .aisq-host-grid { display:grid; grid-template-columns:auto 1fr; gap:5px 12px; padding:11px; border-radius:10px; background:#1d1c22; }
      .aisq-host-grid span { color:#9995a5; }
      .aisq-host-grid strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .aisq-check { display:grid; grid-template-columns:auto 1fr; gap:5px 9px; align-items:start; padding:9px 0; border-bottom:1px solid #ffffff10; }
      .aisq-check input { margin-top:3px; }
      .aisq-check small { grid-column:2; color:#9995a5; }
      .aisq-shortcuts { display:flex; flex-direction:column; gap:5px; padding:11px; border-radius:10px; background:#1d1c22; }
      .aisq-dialog { background:#15151a; color:#f5f4fa; border:1px solid #ffffff26; border-radius:12px; padding:20px; box-shadow:0 24px 80px #000b; max-width:400px; }
      .aisq-dialog h3 { margin:0 0 10px; font-size:16px; }
      .aisq-dialog p { margin:0 0 16px; color:#cfcbd9; line-height:1.4; }
      .aisq-dialog::backdrop { background:rgba(0,0,0,0.6); backdrop-filter:blur(2px); }
      .aisq-checkbox-label { display:flex; align-items:center; gap:8px; cursor:pointer; color:#cfcbd9; margin-bottom:16px; }
      .aisq-footer { position:sticky; bottom:0; padding:8px 16px; border-top:1px solid #ffffff12; background:#15151af2; color:#85818f; font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .aisq-scroll-actions { position:fixed; right:30px; bottom:120px; display:flex; flex-direction:column; gap:8px; z-index:2147483647; }
      .aisq-float-btn { width:32px; height:32px; border-radius:50%; border:1px solid #ffffff20; background:rgba(21,21,26,0.9); color:#cfcbd9; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,0.5); backdrop-filter:blur(4px); font-size:12px; display:grid; place-items:center; transition:background 0.2s, border-color 0.2s; }
      .aisq-float-btn:hover { background:rgba(45,42,58,0.9); border-color:#7357ff; }
      .aisq-global-tooltip { position:fixed; z-index:2147483647; background:rgba(20,20,25,0.95); color:#fff; padding:6px 10px; border-radius:6px; font-size:11px; line-height:1.4; pointer-events:none; opacity:0; transition:opacity 0.15s; white-space:normal; max-width:240px; text-align:center; border:1px solid rgba(255,255,255,0.1); box-shadow:0 4px 12px rgba(0,0,0,0.5); transform:translate(-50%, -100%); margin-top:-8px; }
      .aisq-global-tooltip.visible { opacity:1; }
      .aisq-global-tooltip.bottom-placed { transform:translate(-50%, 0); margin-top:8px; }
    `;
    shadow.append(style);
  }

  function mount() {
    rootHost = document.getElementById(ROOT_ID);
    if (rootHost?.shadowRoot) {
      shadow = rootHost.shadowRoot;
      panel = shadow.getElementById("aisq-panel");
      statusLine = shadow.querySelector(".aisq-footer span:last-child");
      return;
    }
    rootHost = document.createElement("div");
    rootHost.id = ROOT_ID;
    document.documentElement.append(rootHost);
    shadow = rootHost.attachShadow({ mode: "open" });
    installStyles();
    const bubbleHtml = `<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" style="display:block;margin:auto;"><path d="M12 2C12 7.5 16.5 12 22 12C16.5 12 12 16.5 12 22C12 16.5 7.5 12 2 12C7.5 12 12 7.5 12 2Z"/></svg>`;
    const bubble = ctx.el("button", { type: "button", html: bubbleHtml, title: "Toggle AI Studio Copilot", ariaLabel: "Toggle AI Studio Copilot", on: { click: () => mutate(() => { state.settings.panelOpen = !state.settings.panelOpen; }) } });
    bubble.id = "aisq-bubble";
    const dlBubble = ctx.el("button", { type: "button", text: "\u2B07\uFE0E", title: "Download app (Alt+D)", ariaLabel: "Download app", on: { click: () => void ctx.downloadZip() } });
    dlBubble.id = "aisq-dl-bubble";
    panel = ctx.el("section");
    panel.id = "aisq-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "AI Studio Copilot");
    statusLine = ctx.el("span", { text: "ready" });
    const tooltipEl = ctx.el("div", { className: "aisq-global-tooltip" });
    shadow.append(bubble, dlBubble, panel, tooltipEl);

    shadow.addEventListener("mouseover", (e) => {
      const target = e.target.closest("[title]");
      if (!target) return;
      const text = target.getAttribute("title");
      if (!text) return;
      target.setAttribute("data-title", text);
      target.removeAttribute("title");
      tooltipEl.textContent = text;
      tooltipEl.classList.remove("bottom-placed");
      
      const rect = target.getBoundingClientRect();
      let left = rect.left + rect.width / 2;
      let top = rect.top;
      
      // Prevent top edge clipping
      if (top < 40) {
        top = rect.bottom;
        tooltipEl.classList.add("bottom-placed");
      }
      
      // Prevent side edge clipping
      left = Math.max(120, Math.min(window.innerWidth - 120, left));

      tooltipEl.style.left = `${left}px`;
      tooltipEl.style.top = `${top}px`;
      tooltipEl.classList.add("visible");
    }, true);

    shadow.addEventListener("mouseout", (e) => {
      const target = e.target.closest("[data-title]");
      if (target) {
        target.setAttribute("title", target.getAttribute("data-title"));
        target.removeAttribute("data-title");
      }
      tooltipEl.classList.remove("visible");
    }, true);

    render();
  }

  function handleKeydown(event) {
    if (event.altKey && event.shiftKey && event.code === "KeyA") {
      event.preventDefault();
      mutate(() => { state.settings.panelOpen = !state.settings.panelOpen; });
    } else if (event.altKey && event.key?.toLowerCase() === "d") {
      event.preventDefault();
      void ctx.downloadZip();
    } else if (event.altKey && event.key === "Enter" && !rootHost?.contains(event.target)) {
      event.preventDefault();
      void (state.runner.phase === PHASES.PAUSED ? ctx.resumeRunner() : ctx.startRunner("stack"));
    }
  }

  function getTabId() {
    if (!chrome.runtime?.sendMessage) return Promise.resolve(tabId);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => { if (settled) return; settled = true; if (value !== undefined && value !== null) tabId = String(value); resolve(tabId); };
      try {
        chrome.runtime.sendMessage({ type: "AISQ_GET_TAB_ID" }, (response) => finish(response?.tabId));
        setTimeout(() => finish(), 250);
      } catch {
        finish();
      }
    });
  }

  function stopRuntime() {
    clearTimeout(saveTimer);
    if (tickIntervalId) clearInterval(tickIntervalId);
    ctx.activeCountdown = null;
    ctx.textStash = null;
    document.removeEventListener("keydown", handleKeydown, true);
    if (runtimeMessageListener) chrome.runtime.onMessage?.removeListener?.(runtimeMessageListener);
    if (storageChangeListener) storageChangeListener();
    ctx.releaseRunnerLease();
    rootHost?.remove();
    globalThis.__AISQ_CONTENT_LOADED__ = false;
    if (globalThis.__AISQ_RUNTIME__?.stop === stopRuntime) globalThis.__AISQ_RUNTIME__ = null;
  }

  async function init() {
    try {
      await getTabId();
      let saved = await adapter.get(STORAGE_KEY);
      if (!saved) {
        saved = await adapter.get(LEGACY_STORAGE_KEY);
      }
      state = Core.migrateState(saved);
      if (state.runner.pendingPromptId && state.runner.ownerTabId) {
        if (state.runner.ownerTabId === tabId && ['running', 'submitting', 'awaiting_start'].includes(state.runner.phase)) {
           state.runner.crashRecovery = true;
        }
        Core.commitTransition(state, Core.EVENTS.REHYDRATED, {
          promptId: state.runner.pendingPromptId,
          chainId: state.runner.activeChainId,
          previousOwner: state.runner.ownerTabId,
          source: 'storage-hydration',
        });
      }
      persistedRevision = Number(state.revision || 0);
      runnerOwnedByOtherTab = false;
    } catch {
      state = Core.defaultState();
    }
    mount();
    document.addEventListener("keydown", handleKeydown, true);
    runtimeMessageListener = (message, sender, sendResponse) => {
      if (message?.type === "AISQ_TOGGLE") {
        mount();
        mutate(() => { state.settings.panelOpen = !state.settings.panelOpen; });
        sendResponse?.({ ok: true, mounted: true });
      } else if (message?.type === "AISQ_SHOW") {
        mount();
        mutate(() => { state.settings.panelOpen = true; });
        sendResponse?.({ ok: true, mounted: true });
      } else if (message?.type === "AISQ_STATUS") {
        sendResponse?.({ ok: true, mounted: !!rootHost, phase: state.runner.phase });
      }
      return true;
    };
    chrome.runtime.onMessage.addListener(runtimeMessageListener);
    storageChangeListener = adapter.onChanged((changes, areaName) => {
      if (areaName !== "local" || !changes?.[STORAGE_KEY]?.newValue) return;
      acceptStoredState(changes[STORAGE_KEY].newValue);
    });
    tickIntervalId = setInterval(() => {
      if (typeof ctx.tick === "function") void ctx.tick();
    }, TICK_MS);
    globalThis.__AISQ_RUNTIME__ = Object.freeze({ stop: stopRuntime });
    if (typeof ctx.tick === "function") void ctx.tick();
    globalThis.__aisq = Object.freeze({ show: () => mutate(() => { state.settings.panelOpen = true; }), hide: () => mutate(() => { state.settings.panelOpen = false; }), scan: () => ctx.scanHostCached(), state: () => { Core.syncLegacyAliases(state); return clone(state); }, diagnostics: () => clone(ctx.createDiagnosticSnapshot()), tick: () => ctx.tick(), save: () => saveNow(), importText: ctx.importText });
  }

  Promise.resolve().then(() => init());
})();
