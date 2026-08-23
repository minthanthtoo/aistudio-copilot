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
      ui: { draft: "", splitStrategy: "auto", detectedStrategy: "empty", lastImportId: null, lastPlanCommitId: null, pendingPlanCommitId: null, specMode: "paste", specScreen: 0, specAnswers: {}, planMode: "draft", planDraft: null, planMapFocusId: null, planCustomEditingKey: null, fullWizardCustomEditingKey: null, wizardMode: "plan" },
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

  function pageKeyForPath(pathname) {
    const parts = String(pathname || "/").split(/[?#]/, 1)[0].split("/").filter(Boolean);
    let kind = null;
    let identifiers = [];
    if (parts[0] === "apps") {
      kind = "app";
      identifiers = parts.slice(1);
    } else if (parts[0] === "prompts") {
      kind = "prompt";
      identifiers = parts.slice(1);
    } else if (parts[0] === "app" && parts[1] === "apps") {
      kind = "app";
      identifiers = parts.slice(2);
    } else if (parts[0] === "app" && parts[1] === "prompts") {
      kind = "prompt";
      identifiers = parts.slice(2);
    }
    if (!kind) return "root";
    return identifiers.length ? `${kind}:${identifiers.at(-1)}` : `${kind}:home`;
  }

  function normalizePageKey(value) {
    const key = String(value || "root");
    if (/^(?:app|prompt):/.test(key)) return key;
    return pageKeyForPath(key);
  }

  function getCurrentPageKey() {
    if (typeof window === "undefined" || !window.location) return "root";
    return pageKeyForPath(window.location.pathname);
  }

  function migrateState(raw = {}) {
    if (!raw || typeof raw !== "object") raw = {};
    const base = defaultState();
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
    if (legacyRunner.boundPageKey) legacyRunner.boundPageKey = normalizePageKey(legacyRunner.boundPageKey);
    legacyRunner.activeChainId = legacyRunner.activeChainId || legacyRunner.runningSeriesId || selectedChainId;
    if (legacyRunner.pendingPromptId && !chains.some((chain) => chain.id === legacyRunner.activeChainId && chain.prompts.some((prompt) => prompt.id === legacyRunner.pendingPromptId))) {
      const owner = chains.find((chain) => chain.prompts.some((prompt) => prompt.id === legacyRunner.pendingPromptId));
      legacyRunner.activeChainId = owner?.id || null;
    }
    
    const runners = {};
    const rawRunners = raw.runners && typeof raw.runners === "object" ? raw.runners : {};
    const runnerEntries = Object.entries(rawRunners).map(([storedKey, storedRunner]) => {
      const runner = { ...storedRunner };
      if (runner.boundPageKey) runner.boundPageKey = normalizePageKey(runner.boundPageKey);
      const normalizedKey = normalizePageKey(storedKey);
      return { storedKey, normalizedKey, runner };
    });
    for (const entry of runnerEntries) {
      if (entry.normalizedKey === entry.storedKey) runners[entry.normalizedKey] = entry.runner;
    }
    for (const entry of runnerEntries) {
      if (entry.normalizedKey === entry.storedKey) continue;
      if (runners[entry.normalizedKey] === undefined) runners[entry.normalizedKey] = entry.runner;
      else if (runners[entry.storedKey] === undefined) runners[entry.storedKey] = entry.runner;
    }
    
    if (legacyRunner.pendingPromptId && Object.keys(runners).length === 0) {
       const convertedKey = normalizePageKey(legacyRunner.boundPageKey || "root");
       runners[convertedKey] = legacyRunner;
    }
    
    
    const projects = {};
    const rawProjects = raw.projects && typeof raw.projects === "object" ? raw.projects : {};
    const projectEntries = Object.entries(rawProjects).map(([storedKey, project]) => ({ storedKey, normalizedKey: normalizePageKey(storedKey), project }));
    for (const entry of projectEntries) {
      if (entry.normalizedKey === entry.storedKey) projects[entry.normalizedKey] = entry.project;
    }
    for (const entry of projectEntries) {
      if (entry.normalizedKey === entry.storedKey) continue;
      if (projects[entry.normalizedKey] === undefined) projects[entry.normalizedKey] = entry.project;
      else if (projects[entry.storedKey] === undefined) projects[entry.storedKey] = entry.project;
    }
    const currentKey = getCurrentPageKey();
    if (!Object.keys(projects).length && sourceChains.length > 0) {
      projects[currentKey] = {
        chains,
        stackOrder,
        selectedChainId
      };
    }

    const rootProject = projects.root;
    const rootProjectHasData = !!(rootProject?.chains?.length || rootProject?.stackOrder?.length || rootProject?.selectedChainId);
    const rootRunner = runners.root;
    const rootRunnerHasWork = !!(rootRunner && (rootRunner.pendingPromptId || rootRunner.enabled || ![PHASES.IDLE, PHASES.READY].includes(rootRunner.phase)));
    const rootBoundKey = normalizePageKey(rootRunner?.boundPageKey || "root");
    const boundUpgradesToCurrent = (rootBoundKey === "app:home" && currentKey.startsWith("app:") && currentKey !== "app:home") ||
      (rootBoundKey === "prompt:home" && currentKey.startsWith("prompt:") && currentKey !== "prompt:home");
    const rootDestinationKey = rootRunnerHasWork && rootBoundKey !== "root" && !boundUpgradesToCurrent ? rootBoundKey : currentKey;
    const rootPairConflict = rootDestinationKey !== "root" && rootProjectHasData && rootRunnerHasWork &&
      (projects[rootDestinationKey] !== undefined || runners[rootDestinationKey] !== undefined);
    if (rootDestinationKey !== "root" && !rootPairConflict) {
      if (!projects[rootDestinationKey] && rootProjectHasData) {
        projects[rootDestinationKey] = rootProject;
        delete projects.root;
      }
      if (!runners[rootDestinationKey] && rootRunnerHasWork) {
        runners[rootDestinationKey] = { ...rootRunner, boundPageKey: rootBoundKey !== "root" ? rootBoundKey : rootDestinationKey };
        delete runners.root;
      }
    }

    const legacyAnswers = raw.ui?.specAnswers && typeof raw.ui.specAnswers === "object" ? raw.ui.specAnswers : {};
    const planDraft = global.AISQPlan?.migrateDraft?.(raw.ui?.planDraft, legacyAnswers) || null;
    const state = {
      ...base,
      ...raw,
      schemaVersion: SCHEMA_VERSION,
      revision: Math.max(0, Number(raw.revision || 0)),
      updatedAt: raw.updatedAt || base.updatedAt,
      projects,
      runners,
      settings: { ...base.settings, ...(raw.settings || {}) },
      ui: { ...base.ui, ...(raw.ui || {}), planDraft, planCustomEditingKey: null, fullWizardCustomEditingKey: null },
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

  

  Object.assign(Core, { defaultSettings, defaultRunner, defaultProject, defaultState, inferStatus, normalizePrompt, normalizeChain, syncLegacyAliases, ensureStackOrder, pageKeyForPath, normalizePageKey, getCurrentPageKey, migrateState, makeChain, makeQueue, promptRecords });
})(typeof globalThis !== "undefined" ? globalThis : this);
