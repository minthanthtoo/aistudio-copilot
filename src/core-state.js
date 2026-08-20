(function initAISQCoreState(global) {
  "use strict";
  const Core = global.AISQCore;
  const { nowISO, uid, hashText, labelForPrompt, normalizeText, SCHEMA_VERSION, PHASES, PROMPT_STATUSES, EVENTS } = Core;

  function promptRecords(parts) {
    return parts.map((text, index) => ({
      id: uid("prompt"),
      label: labelForPrompt(text, index),
      text: normalizeText(text),
      status: "queued",
      attempts: 0,
      submittedAt: null,
      completedAt: null,
      error: null
    }));
  }

  function defaultSettings() {
    return {
      autoRun: true,
      autoRetry: true,
      maxRetries: 0,
      retryDelayMs: 5000,
      settleMs: 2500,
      interPromptDelayMs: 3000,
      interChainDelayMs: 3000,
      startTimeoutMs: 20000,
      completionTimeoutMs: 12 * 60 * 1000,
      failurePolicy: "pause",
      pastePlacement: "end",
      stopAfterChain: false,
      autoAllowAccess: false,
      autoFix: false,
      autoDownloadOnDone: false,
      panelOpen: false,
      isMinimized: false,
      activeTab: "build"
    };
  }

  function defaultRunner() {
    return {
      phase: PHASES.IDLE,
      enabled: false,
      scope: "stack",
      scopeChainId: null,
      activeChainId: null,
      pendingPromptId: null,
      nextTarget: null,
      submittedAt: null,
      clickedAt: null,
      baselineTurnCount: 0,
      sawBusy: false,
      settleUntil: null,
      nextActionAt: null,
      retryCount: 0,
      lastError: null,
      lastHostState: "unknown",
      ownerTabId: null,
      boundPageKey: null,
      leaseUpdatedAt: null,
      revision: 0,
      updatedAt: nowISO()
    };
  }

  
  function defaultProject() {
    return {
      chains: [],
      stackOrder: [],
      selectedChainId: null
    };
  }

  function defaultState() {
    const state = {
      schemaVersion: SCHEMA_VERSION,
      revision: 0,
      updatedAt: nowISO(),
      projects: {},
      runners: {},
      runner: defaultRunner(),
      settings: defaultSettings(),
      ui: { draft: "", splitStrategy: "auto", detectedStrategy: "empty", lastImportId: null, specMode: "paste", specScreen: 0, specAnswers: {} },
      history: [],
      eventLog: [],
      // Compatibility aliases. syncLegacyAliases keeps these references aligned.
      queues: [],
      activeQueueId: null
    };
    return state;
  }

  function inferStatus(prompt) {
    if (PROMPT_STATUSES.includes(prompt?.status)) return prompt.status;
    if (prompt?.completedAt || prompt?.sentAt) return "complete";
    return "queued";
  }

  function normalizePrompt(prompt, index = 0) {
    const text = normalizeText(prompt?.text || prompt?.value || "");
    return {
      id: String(prompt?.id || uid("prompt")),
      label: String(prompt?.label || labelForPrompt(text, index)),
      text,
      status: inferStatus(prompt),
      attempts: Math.max(0, Number(prompt?.attempts || 0)),
      submittedAt: prompt?.submittedAt || null,
      completedAt: prompt?.completedAt || prompt?.sentAt || null,
      error: prompt?.error || null,
      includePreface: prompt?.includePreface !== false
    };
  }

  function normalizeChain(chain, index = 0) {
    const raw = chain || {};
    const sourceRaw = normalizeText(raw.source?.raw || raw.sourceText || raw.raw || "");
    const prompts = Array.isArray(raw.prompts) ? raw.prompts.map(normalizePrompt) : [];
    const id = String(raw.id || uid("chain"));
    const stamp = raw.createdAt || nowISO();
    return {
      id,
      name: String(raw.name || raw.title || `Chain ${index + 1}`).trim() || `Chain ${index + 1}`,
      source: {
        raw: sourceRaw,
        hash: String(raw.source?.hash || raw.sourceHash || hashText(sourceRaw)),
        splitStrategy: String(raw.source?.splitStrategy || raw.splitStrategy || "auto"),
        pastedAt: raw.source?.pastedAt || raw.createdAt || stamp
      },
      createdAt: stamp,
      updatedAt: raw.updatedAt || stamp,
      prompts,
      preface: raw.preface || "",
      // cursor is retained as a display/recovery hint only; status and IDs are authoritative.
      cursor: Math.max(0, Number(raw.cursor || 0))
    };
  }

  function syncLegacyAliases(state) {
    state.queues = state.chains;
    state.activeQueueId = state.selectedChainId;
    return state;
  }

  function ensureStackOrder(state) {
    const existing = new Set(state.chains.map((chain) => chain.id));
    const seen = new Set();
    const input = Array.isArray(state.stackOrder) ? state.stackOrder : [];
    state.stackOrder = input.filter((id) => existing.has(id) && !seen.has(id) && seen.add(id));
    for (const chain of state.chains) if (!seen.has(chain.id)) state.stackOrder.push(chain.id);
    return state.stackOrder;
  }

  function getCurrentPageKey() {
    if (typeof window === 'undefined' || !window.location) return 'root';
    const p = window.location.pathname;
    if (p.startsWith("/app/prompts/")) return "prompt:" + p.split("/").pop();
    if (p === "/app/prompts") return "prompt:home";
    if (p.startsWith("/app/apps/")) return "app:" + p.split("/").pop();
    if (p === "/app/apps") return "app:home";
    return "root";
  }

  function migrateState(raw = {}) {
    const base = defaultState();
    if (!raw || typeof raw !== "object") return base;
    const sourceChains = Array.isArray(raw.chains)
      ? raw.chains
      : Array.isArray(raw.queues) ? raw.queues : [];
    const chains = sourceChains.map(normalizeChain);
    const legacyOrder = raw.global?.execOrder;
    const stackOrder = Array.isArray(raw.stackOrder)
      ? raw.stackOrder.slice()
      : Array.isArray(legacyOrder) ? legacyOrder.slice() : chains.map((chain) => chain.id);
    const selectedChainId = raw.selectedChainId || raw.activeQueueId || chains[0]?.id || null;
    const legacyRunner = { ...base.runner, ...(raw.runner || {}) };
    legacyRunner.activeChainId = legacyRunner.activeChainId || legacyRunner.runningSeriesId || selectedChainId;
    if (legacyRunner.pendingPromptId && !chains.some((chain) => chain.id === legacyRunner.activeChainId && chain.prompts.some((prompt) => prompt.id === legacyRunner.pendingPromptId))) {
      const owner = chains.find((chain) => chain.prompts.some((prompt) => prompt.id === legacyRunner.pendingPromptId));
      legacyRunner.activeChainId = owner?.id || null;
    }
    
    const runners = raw.runners || {};
    
    if (legacyRunner.pendingPromptId && Object.keys(runners).length === 0) {
       const boundKey = legacyRunner.boundPageKey || "root";
       const convertedKey = boundKey.startsWith("/app/apps/") ? "app:" + boundKey.split("/").pop() 
                          : boundKey.startsWith("/app/prompts/") ? "prompt:" + boundKey.split("/").pop() 
                          : "root";
       runners[convertedKey] = legacyRunner;
    }
    
    
    let projects = raw.projects || {};
    if (!raw.projects && sourceChains.length > 0) {
      const currentKey = getCurrentPageKey();
      projects[currentKey] = {
        chains,
        stackOrder,
        selectedChainId
      };
    }

    const state = {
      ...base,
      ...raw,
      schemaVersion: SCHEMA_VERSION,
      revision: Math.max(0, Number(raw.revision || 0)),
      updatedAt: raw.updatedAt || base.updatedAt,
      projects,
      runners,
      settings: { ...base.settings, ...(raw.settings || {}) },
      ui: { ...base.ui, ...(raw.ui || {}) },
      history: Array.isArray(raw.history) ? raw.history.slice(-300) : [],
      eventLog: Array.isArray(raw.eventLog) ? raw.eventLog.slice(-400) : []
    };
    
    
    for (const prop of ['chains', 'stackOrder', 'selectedChainId']) {
      Object.defineProperty(state, prop, {
        enumerable: true,
        get() {
          const key = getCurrentPageKey();
          if (!this.projects[key]) this.projects[key] = defaultProject();
          if (this.projects[key][prop] === undefined) this.projects[key][prop] = defaultProject()[prop];
          return this.projects[key][prop];
        },
        set(val) {
          const key = getCurrentPageKey();
          if (!this.projects[key]) this.projects[key] = defaultProject();
          this.projects[key][prop] = val;
        }
      });
    }

    Object.defineProperty(state, 'runner', {
      enumerable: true,
      get() {
        const key = getCurrentPageKey();
        if (!this.runners[key]) {
          this.runners[key] = { ...defaultRunner(), phase: PHASES.READY, enabled: false, activeChainId: this.selectedChainId };
        }
        return this.runners[key];
      },
      set(val) {
        const key = getCurrentPageKey();
        this.runners[key] = val;
      }
    });
    ensureStackOrder(state);
    if (!state.selectedChainId || !state.chains.some((chain) => chain.id === state.selectedChainId)) state.selectedChainId = state.stackOrder[0] || null;
    if (state.runner.pendingPromptId && state.runner.activeChainId) {
      const chain = Core.getChainById(state, state.runner.activeChainId);
      const prompt = chain?.prompts.find((item) => item.id === state.runner.pendingPromptId);
      if (prompt) prompt.status = "pending";
    }
    return syncLegacyAliases(state);
  }

  function makeChain(name, prompts, sourceText = "", source = {}) {
    const stamp = nowISO();
    const raw = normalizeText(source.raw || sourceText);
    return {
      id: uid("chain"),
      name: String(name || "Prompt chain").trim() || "Prompt chain",
      source: {
        raw,
        hash: String(source.hash || hashText(raw)),
        splitStrategy: String(source.splitStrategy || "auto"),
        pastedAt: source.pastedAt || stamp
      },
      createdAt: stamp,
      updatedAt: stamp,
      cursor: 0,
      preface: source.preface || "",
      prompts: Array.isArray(prompts) ? prompts.map(normalizePrompt) : []
    };
  }

  function makeQueue(name, prompts, sourceText = "") {
    const queue = makeChain(name, prompts, sourceText);
    queue.id = uid("queue");
    return queue;
  }

  

  Object.assign(Core, { defaultSettings, defaultRunner, defaultProject, defaultState, inferStatus, normalizePrompt, normalizeChain, syncLegacyAliases, ensureStackOrder, getCurrentPageKey, migrateState, makeChain, makeQueue, promptRecords });
})(typeof globalThis !== "undefined" ? globalThis : this);
