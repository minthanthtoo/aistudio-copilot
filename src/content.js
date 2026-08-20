(function initAISQContent() {
  "use strict";
  console.log("[AISQ] content.js started execution.");

  const ROOT_ID = "aisq-extension-root";
  if (globalThis.__AISQ_CONTENT_LOADED__ && document.getElementById(ROOT_ID)) {
    console.log("[AISQ] content.js aborted: already loaded.");
    return;
  }
  if (globalThis.__AISQ_CONTENT_LOADED__) {
    console.log("[AISQ] content.js stopping old runtime.");
    globalThis.__AISQ_RUNTIME__?.stop?.();
  }
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
    adapter,
    STORAGE_KEY,
    LEGACY_STORAGE_KEY,
    TICK_MS,
    LEASE_MS,
    
    // Core functions
    addHistory: function(...args) { return addHistory(...args); },
    enqueueSave: function(...args) { return enqueueSave(...args); },
    touchState: function(...args) { return touchState(...args); },
    toast: function(...args) { return toast(...args); },
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





  function handleKeydown(event) {
    if (event.key === "Escape" && rootHost?.contains(event.target)) {
      event.preventDefault();
      mutate(() => {
        if (state.settings.activeTab === "build" && state.ui && state.ui.buildView && state.ui.buildView !== "input") {
          state.ui.buildView = "input";
        } else {
          state.settings.panelOpen = false;
        }
      });
      return;
    }
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
      if (typeof ctx.tick === "function") {
        checkUrlUpgrade();
        void ctx.tick();
      } else {
        console.error("[AISQ] INTERVAL ERROR: ctx.tick is not a function! It is:", typeof ctx.tick);
      }
    }, TICK_MS);
    globalThis.__AISQ_RUNTIME__ = Object.freeze({ stop: stopRuntime });
    if (typeof ctx.tick === "function") {
      checkUrlUpgrade();
        void ctx.tick();
    } else {
      console.error("[AISQ] SYNC ERROR: ctx.tick is not a function! It is:", typeof ctx.tick);
    }
    globalThis.__aisq = Object.freeze({ show: () => mutate(() => { state.settings.panelOpen = true; }), hide: () => mutate(() => { state.settings.panelOpen = false; }), scan: () => ctx.scanHostCached(), state: () => { Core.syncLegacyAliases(state); return clone(state); }, diagnostics: () => clone(ctx.createDiagnosticSnapshot()), tick: () => ctx.tick(), save: () => saveNow(), importText: ctx.importText });
  }

  ctx.init = init;
})();
