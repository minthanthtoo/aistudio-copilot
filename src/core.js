(function initAISQCore(global) {
  "use strict";

  // V2 makes chains and execution order first-class. The queues/activeQueueId
  // aliases are intentionally retained so V1 clients and recovery fixtures can
  // still inspect a migrated state without becoming a second source of truth.
  const SCHEMA_VERSION = 2;
  const PHASES = Object.freeze({
    IDLE: "idle",
    READY: "ready",
    SUBMITTING: "submitting",
    AWAITING: "awaiting_start",
    RUNNING: "running",
    SETTLING: "settling",
    RETRY_WAIT: "retry_wait",
    PACING: "pacing",
    PAUSED: "paused",
    DONE: "done",
    ERROR: "error"
  });
  const PROMPT_STATUSES = Object.freeze(["queued", "pending", "complete", "error", "skipped"]);

  const nowISO = () => new Date().toISOString();
  const uid = (prefix = "id") => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const normalizeText = (value) => String(value || "").replace(/\r\n?/g, "\n").trim();

  function hashText(value) {
    const text = String(value || "");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function mapLinesOutsideFences(text, predicate) {
    const lines = text.split("\n");
    const matches = [];
    let fence = null;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const marker = line.match(/^\s*(```+|~~~+)/)?.[1]?.slice(0, 3) || null;
      if (marker) fence = fence ? (fence === marker ? null : fence) : marker;
      if (!fence && predicate(line, index, lines)) matches.push(index);
    }
    return { lines, matches };
  }

  function splitAtHeaders(text, headerPattern) {
    const { lines, matches } = mapLinesOutsideFences(text, (line) => headerPattern.test(line));
    if (matches.length < 2) return null;
    const preface = lines.slice(0, matches[0]).join("\n").trim();
    const parts = matches.map((start, index) => {
      const end = matches[index + 1] ?? lines.length;
      return lines.slice(start, end).join("\n").trim();
    }).filter(Boolean);
    return parts.length >= 2 ? { preface, parts } : null;
  }

  function splitAtDelimiters(text) {
    const delimiter = /^\s*(?:-{3,}|_{3,}|\*{3,}|⸻+|—{3,})\s*$/;
    const { lines, matches } = mapLinesOutsideFences(text, (line) => delimiter.test(line));
    if (!matches.length) return null;
    const points = [-1, ...matches, lines.length];
    const chunks = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const block = lines.slice(points[index] + 1, points[index + 1]).join("\n").trim();
      chunks.push(block);
    }
    let preface = "";
    let parts = chunks;
    const headerPattern = /^(?:#{1,6}\s*)?(?:(?:Stage|Phase|Step|Round|Part)\s+\d+|(?:\[)?(?:P|R)\d{3}(?:\])?|Prompt\s+\d+)\b/i;
    if (chunks.length > 1 && !headerPattern.test(chunks[0]) && headerPattern.test(chunks[1])) {
      preface = chunks[0];
      parts = chunks.slice(1);
    } else if (chunks.length > 1 && !chunks[0]) {
      preface = chunks[0];
      parts = chunks.slice(1);
    } else if (chunks.length > 1 && chunks[0].length < 24 && !headerPattern.test(chunks[0])) {
      preface = chunks[0];
      parts = chunks.slice(1);
    }
    parts = parts.filter(Boolean);
    if (parts.length < 2 || parts.some((part) => part.length < 24)) return null;
    return { preface, parts };
  }

  function splitNumberedBlocks(text) {
    const { lines, matches } = mapLinesOutsideFences(text, (line) => /^[ \t]{0,3}\d+[.)]\s+\S/.test(line));
    if (matches.length < 3) return null;
    const preface = lines.slice(0, matches[0]).join("\n").trim();
    const parts = matches.map((start, index) => {
      const end = matches[index + 1] ?? lines.length;
      return lines.slice(start, end).join("\n").trim();
    }).filter(Boolean);
    if (parts.some((part) => part.length < 40)) return null;
    return { preface, parts };
  }

  function labelForPrompt(text, index) {
    const lines = String(text || "").split("\n").map((line) => line.trim()).filter(Boolean);
    const structured = lines.find((line) => /^(?:#{1,6}\s*)?(?:(?:Stage|Phase|Step|Round|Part)\s+\d+|(?:\[)?(?:P|R)\d{3}(?:\])?|Prompt\s+\d+)\b/i.test(line));
    const first = structured || lines[0] || `Prompt ${index + 1}`;
    const cleaned = first.replace(/^#{1,6}\s*/, "").replace(/^[-*]\s+/, "");
    return cleaned.length > 72 ? `${cleaned.slice(0, 69)}…` : cleaned;
  }

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

  function parsePromptPack(raw, strategy = "auto") {
    const text = normalizeText(raw);
    if (!text) return { strategy: "empty", preface: "", prompts: [] };

    const strategies = {
      stage: () => splitAtHeaders(text, /^[ \t]{0,3}(?:#{1,6}\s*)?(?:Stage|Phase|Step|Round|Part)\s+\d+\b/i),
      id: () => splitAtHeaders(text, /^[ \t]{0,3}(?:#{1,6}\s*)?(?:\[)?(?:P|R)\d{3}(?:\])?\b/i),
      prompt: () => splitAtHeaders(text, /^[ \t]{0,3}(?:#{1,6}\s*)?Prompt\s+\d+\b/i),
      delimiter: () => splitAtDelimiters(text),
      numbered: () => splitNumberedBlocks(text),
      single: () => ({ preface: "", parts: [text] })
    };

    if (strategy !== "auto") {
      const selected = strategies[strategy] ? strategies[strategy]() : null;
      if (selected && selected.parts.length) {
        return { strategy, preface: selected.preface || "", prompts: promptRecords(selected.parts) };
      }
      return { strategy: "single", preface: "", prompts: promptRecords([text]) };
    }

    for (const name of ["delimiter", "stage", "id", "prompt", "numbered"]) {
      const result = strategies[name]();
      if (result && result.parts.length) {
        return { strategy: name, preface: result.preface || "", prompts: promptRecords(result.parts) };
      }
    }
    return { strategy: "single", preface: "", prompts: promptRecords([text]) };
  }

  function defaultSettings() {
    return {
      autoRun: true,
      autoRetry: true,
      maxRetries: 2,
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

  function defaultState() {
    const state = {
      schemaVersion: SCHEMA_VERSION,
      revision: 0,
      updatedAt: nowISO(),
      chains: [],
      stackOrder: [],
      selectedChainId: null,
      runner: defaultRunner(),
      settings: defaultSettings(),
      ui: { draft: "", splitStrategy: "auto", detectedStrategy: "empty", lastImportId: null },
      history: [],
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

  function migrateState(value) {
    const base = defaultState();
    const raw = value && typeof value === "object" ? value : {};
    // A V1-compatible in-memory fixture can contain the default empty `chains`
    // array alongside populated `queues`. Prefer the populated representation.
    const sourceChains = Array.isArray(raw.chains) && (raw.chains.length || !Array.isArray(raw.queues) || !raw.queues.length)
      ? raw.chains
      : Array.isArray(raw.queues) ? raw.queues : [];
    const chains = sourceChains.map(normalizeChain);
    const legacyOrder = raw.global?.execOrder;
    const stackOrder = Array.isArray(raw.stackOrder)
      ? raw.stackOrder.slice()
      : Array.isArray(legacyOrder) ? legacyOrder.slice() : chains.map((chain) => chain.id);
    const selectedChainId = raw.selectedChainId || raw.activeQueueId || chains[0]?.id || null;
    const runner = { ...base.runner, ...(raw.runner || {}) };
    runner.activeChainId = runner.activeChainId || runner.runningSeriesId || selectedChainId;
    if (runner.pendingPromptId && !chains.some((chain) => chain.id === runner.activeChainId && chain.prompts.some((prompt) => prompt.id === runner.pendingPromptId))) {
      const owner = chains.find((chain) => chain.prompts.some((prompt) => prompt.id === runner.pendingPromptId));
      runner.activeChainId = owner?.id || null;
    }
    const state = {
      ...base,
      ...raw,
      schemaVersion: SCHEMA_VERSION,
      revision: Math.max(0, Number(raw.revision || 0)),
      updatedAt: raw.updatedAt || base.updatedAt,
      chains,
      stackOrder,
      selectedChainId,
      runner,
      settings: { ...base.settings, ...(raw.settings || {}) },
      ui: { ...base.ui, ...(raw.ui || {}) },
      history: Array.isArray(raw.history) ? raw.history.slice(-300) : []
    };
    ensureStackOrder(state);
    if (!state.selectedChainId || !state.chains.some((chain) => chain.id === state.selectedChainId)) state.selectedChainId = state.stackOrder[0] || null;
    if (state.runner.pendingPromptId && state.runner.activeChainId) {
      const chain = getChainById(state, state.runner.activeChainId);
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

  function getChainById(state, id) {
    return state?.chains?.find((chain) => chain.id === id) || null;
  }

  function getSelectedChain(state) {
    return getChainById(state, state?.selectedChainId) || null;
  }

  function getActiveQueue(state) {
    return getSelectedChain(state);
  }

  function findChainForPrompt(state, promptId) {
    return state?.chains?.find((chain) => chain.prompts.some((prompt) => prompt.id === promptId)) || null;
  }

  function getRunnerChain(state) {
    return getChainById(state, state?.runner?.activeChainId) || null;
  }

  function getRunnerPrompt(state) {
    const chain = getRunnerChain(state);
    return chain?.prompts.find((prompt) => prompt.id === state.runner.pendingPromptId) || null;
  }

  function nextQueuedPrompt(chain) {
    if (!chain) return null;
    const index = chain.prompts.findIndex((prompt) => prompt.status === "queued" || prompt.status === "error");
    if (index < 0) return null;
    chain.cursor = index;
    return chain.prompts[index];
  }

  function chainCounts(chain) {
    const counts = { total: 0, queued: 0, pending: 0, complete: 0, error: 0, skipped: 0 };
    if (!chain) return counts;
    counts.total = chain.prompts.length;
    for (const prompt of chain.prompts) {
      const key = PROMPT_STATUSES.includes(prompt.status) ? prompt.status : "queued";
      counts[key] += 1;
    }
    return counts;
  }

  const queueCounts = chainCounts;

  function chainStatus(state, chain) {
    if (!chain) return "empty";
    if (state?.runner?.activeChainId === chain.id && state.runner.enabled) return "running";
    const counts = chainCounts(chain);
    if (!counts.total) return "empty";
    if (counts.error) return "error";
    if (counts.pending) return "pending";
    if (counts.queued) return counts.complete || counts.skipped ? "partial" : "queued";
    return "complete";
  }

  function stackCounts(state) {
    const counts = { chains: 0, prompts: 0, queued: 0, pending: 0, complete: 0, error: 0, skipped: 0 };
    for (const id of state?.stackOrder || []) {
      const chain = getChainById(state, id);
      if (!chain) continue;
      counts.chains += 1;
      const chainCount = chainCounts(chain);
      counts.prompts += chainCount.total;
      for (const key of ["queued", "pending", "complete", "error", "skipped"]) counts[key] += chainCount[key];
    }
    return counts;
  }

  function nextStackTarget(state, options = {}) {
    const order = ensureStackOrder(state);
    const selectedOnly = !!options.selectedOnly;
    if (selectedOnly) {
      const selected = getChainById(state, options.startChainId || state.selectedChainId);
      const prompt = nextQueuedPrompt(selected);
      return selected && prompt ? { chain: selected, prompt, chainIndex: order.indexOf(selected.id), promptIndex: selected.prompts.indexOf(prompt) } : null;
    }
    const startId = options.startChainId || state.runner?.activeChainId || (selectedOnly ? state.selectedChainId : null);
    let startIndex = startId ? order.indexOf(startId) : -1;
    if (startIndex < 0) startIndex = -1;
    const end = selectedOnly ? Math.min(startIndex + 1, order.length) : order.length;
    for (let index = startIndex < 0 ? 0 : startIndex; index < end; index += 1) {
      const chain = getChainById(state, order[index]);
      const prompt = nextQueuedPrompt(chain);
      if (chain && prompt) return { chain, prompt, chainIndex: index, promptIndex: chain.prompts.indexOf(prompt) };
    }
    return null;
  }

  function nextChainTarget(state, currentChainId) {
    return nextStackTarget(state, { startChainId: currentChainId });
  }

  function promptIsLocked(state, promptId) {
    return state?.runner?.pendingPromptId === promptId || state?.chains?.some((chain) => chain.prompts.some((prompt) => prompt.id === promptId && prompt.status === "pending"));
  }

  function chainIsLocked(state, chainId) {
    return state?.runner?.activeChainId === chainId && !!state.runner?.pendingPromptId;
  }

  function reject(message) {
    return { ok: false, error: message };
  }

  function applyCommand(state, command) {
    const type = command?.type;
    const payload = command?.payload || {};
    const chain = payload.chainId ? getChainById(state, payload.chainId) : getSelectedChain(state);
    let result = { ok: true, value: null };
    if (type === "IMPORT_CHAIN") {
      const imported = normalizeChain(payload.chain);
      if (!imported.prompts.length) return reject("Cannot add an empty chain");
      state.chains.push(imported);
      ensureStackOrder(state);
      const placement = payload.placement === "after" ? state.stackOrder.indexOf(payload.afterChainId) + 1 : state.stackOrder.length;
      state.stackOrder = state.stackOrder.filter((id) => id !== imported.id);
      const activeIndex = state.runner.enabled ? state.stackOrder.indexOf(state.runner.activeChainId) : -1;
      const safeIndex = Math.max(activeIndex + 1, Math.max(0, Math.min(Number.isFinite(placement) ? placement : state.stackOrder.length, state.stackOrder.length)));
      state.stackOrder.splice(safeIndex, 0, imported.id);
      state.selectedChainId = imported.id;
      state.ui.lastImportId = imported.id;
      result.value = imported;
    } else if (type === "SELECT_CHAIN") {
      if (!getChainById(state, payload.chainId)) return reject("Chain not found");
      state.selectedChainId = payload.chainId;
    } else if (type === "RENAME_CHAIN") {
      if (!chain) return reject("Chain not found");
      chain.name = normalizeText(payload.name) || "Prompt chain";
      chain.updatedAt = nowISO();
    } else if (type === "TOGGLE_ALL_PREFACES") {
      if (!chain) return reject("Chain not found");
      const include = payload.include !== false;
      chain.prompts.forEach((prompt) => { prompt.includePreface = include; });
      chain.updatedAt = nowISO();
    } else if (type === "MOVE_CHAIN") {
      if (!chain) return reject("Chain not found");
      if (state.runner.enabled && chain.id === state.runner.activeChainId) return reject("The running chain is locked");
      const index = state.stackOrder.indexOf(chain.id);
      const target = index + Number(payload.direction || 0);
      if (index < 0 || target < 0 || target >= state.stackOrder.length) return reject("Chain is already at that edge");
      const activeIndex = state.runner.enabled ? state.stackOrder.indexOf(state.runner.activeChainId) : -1;
      if (activeIndex >= 0 && (index <= activeIndex || target <= activeIndex)) return reject("Only chains after the running chain can be reordered");
      [state.stackOrder[index], state.stackOrder[target]] = [state.stackOrder[target], state.stackOrder[index]];
    } else if (type === "REMOVE_CHAIN_FROM_STACK") {
      if (!chain) return reject("Chain not found");
      if (chainIsLocked(state, chain.id) || (state.runner.enabled && chain.id === state.runner.activeChainId)) return reject("The active chain is locked");
      state.stackOrder = state.stackOrder.filter((id) => id !== chain.id);
    } else if (type === "ADD_CHAIN_TO_STACK") {
      if (!chain) return reject("Chain not found");
      if (!state.stackOrder.includes(chain.id)) state.stackOrder.push(chain.id);
    } else if (type === "JUMP_TO_CHAIN") {
      if (!chain) return reject("Chain not found");
      if (chainIsLocked(state, chain.id) || (state.runner.enabled && chain.id === state.runner.activeChainId)) return reject("The running chain is locked");
      state.stackOrder = state.stackOrder.filter((id) => id !== chain.id);
      const activeIndex = state.runner.enabled ? state.stackOrder.indexOf(state.runner.activeChainId) : -1;
      state.stackOrder.splice(activeIndex + 1, 0, chain.id);
      if (!state.runner.enabled) {
        state.runner.activeChainId = chain.id;
        state.runner.pendingPromptId = null;
      }
      state.selectedChainId = chain.id;
    } else if (type === "MOVE_CHAIN_TO_BOTTOM") {
      if (!chain) return reject("Chain not found");
      if (state.runner.enabled && chain.id === state.runner.activeChainId) return reject("The running chain is locked");
      state.stackOrder = state.stackOrder.filter((id) => id !== chain.id);
      state.stackOrder.push(chain.id);
    } else if (type === "DELETE_CHAIN") {
      if (!chain) return reject("Chain not found");
      if (chainIsLocked(state, chain.id) || (state.runner.enabled && chain.id === state.runner.activeChainId)) return reject("Pause before deleting the active chain");
      state.chains = state.chains.filter((item) => item.id !== chain.id);
      state.stackOrder = state.stackOrder.filter((id) => id !== chain.id);
      if (state.selectedChainId === chain.id) state.selectedChainId = state.stackOrder[0] || state.chains[0]?.id || null;
    } else if (type === "DUPLICATE_CHAIN") {
      if (!chain) return reject("Chain not found");
      const copy = makeChain(`${chain.name} copy`, chain.prompts.map((prompt) => ({ ...prompt, id: uid("prompt"), status: "queued", attempts: 0, submittedAt: null, completedAt: null, error: null })), chain.source.raw, chain.source);
      const index = state.stackOrder.indexOf(chain.id);
      const activeIndex = state.runner.enabled ? state.stackOrder.indexOf(state.runner.activeChainId) : -1;
      const insertionIndex = index < 0 ? state.stackOrder.length : Math.max(index + 1, activeIndex + 1);
      state.chains.push(copy);
      state.stackOrder.splice(insertionIndex, 0, copy.id);
      state.selectedChainId = copy.id;
      result.value = copy;
    } else if (type === "EDIT_PROMPT") {
      const prompt = chain?.prompts.find((item) => item.id === payload.promptId);
      if (!prompt) return reject("Prompt not found");
      if (promptIsLocked(state, prompt.id) || ["complete", "skipped"].includes(prompt.status)) return reject("This prompt is locked; reset it before editing");
      prompt.text = normalizeText(payload.text);
      if (!prompt.text) return reject("Prompt text cannot be empty");
      prompt.label = labelForPrompt(prompt.text, chain.prompts.indexOf(prompt));
      chain.updatedAt = nowISO();
    } else if (type === "TOGGLE_PROMPT_PREFACE") {
      const prompt = chain?.prompts.find((item) => item.id === payload.promptId);
      if (!prompt) return reject("Prompt not found");
      prompt.includePreface = payload.include !== false;
      chain.updatedAt = nowISO();
    } else if (type === "MOVE_PROMPT") {
      const index = chain?.prompts.findIndex((item) => item.id === payload.promptId) ?? -1;
      if (!chain || index < 0) return reject("Prompt not found");
      const target = index + Number(payload.direction || 0);
      if (target < 0 || target >= chain.prompts.length) return reject("Prompt is already at that edge");
      const current = chain.prompts[index];
      const other = chain.prompts[target];
      if ([current, other].some((item) => promptIsLocked(state, item.id) || ["complete", "skipped"].includes(item.status))) return reject("Only future queued prompts can be reordered");
      [chain.prompts[index], chain.prompts[target]] = [chain.prompts[target], chain.prompts[index]];
      chain.updatedAt = nowISO();
    } else if (type === "DELETE_PROMPT") {
      const index = chain?.prompts.findIndex((item) => item.id === payload.promptId) ?? -1;
      if (!chain || index < 0) return reject("Prompt not found");
      const prompt = chain.prompts[index];
      if (promptIsLocked(state, prompt.id) || ["complete", "skipped"].includes(prompt.status)) return reject("This prompt is locked; reset it before deleting");
      chain.prompts.splice(index, 1);
      chain.updatedAt = nowISO();
    } else if (type === "ADD_PROMPT") {
      if (!chain) return reject("Chain not found");
      if (chainIsLocked(state, chain.id)) return reject("The active chain has a pending prompt");
      const prompt = normalizePrompt({ id: uid("prompt"), text: payload.text || "", status: "queued" }, chain.prompts.length);
      if (!prompt.text) return reject("Prompt text cannot be empty");
      const index = Math.max(0, Math.min(Number(payload.index ?? chain.prompts.length), chain.prompts.length));
      chain.prompts.splice(index, 0, prompt);
      chain.updatedAt = nowISO();
      result.value = prompt;
    } else if (type === "MERGE_PROMPT") {
      const index = chain?.prompts.findIndex((item) => item.id === payload.promptId) ?? -1;
      if (!chain || index < 0 || index >= chain.prompts.length - 1) return reject("There is no next prompt to merge");
      const current = chain.prompts[index];
      const next = chain.prompts[index + 1];
      if ([current, next].some((item) => promptIsLocked(state, item.id) || ["complete", "skipped"].includes(item.status))) return reject("Only future queued prompts can be merged");
      current.text = `${current.text}\n\n${next.text}`.trim();
      current.label = labelForPrompt(current.text, index);
      chain.prompts.splice(index + 1, 1);
      chain.updatedAt = nowISO();
    } else if (type === "RESET_CHAIN") {
      if (!chain) return reject("Chain not found");
      if (chainIsLocked(state, chain.id) || (state.runner.enabled && chain.id === state.runner.activeChainId)) return reject("Pause before resetting the active chain");
      for (const prompt of chain.prompts) {
        prompt.status = "queued";
        prompt.attempts = 0;
        prompt.submittedAt = null;
        prompt.completedAt = null;
        prompt.error = null;
      }
      chain.cursor = 0;
      chain.updatedAt = nowISO();
    } else if (type === "RESET_FROM_PROMPT") {
      const index = chain?.prompts.findIndex((item) => item.id === payload.promptId) ?? -1;
      if (!chain || index < 0) return reject("Prompt not found");
      if (chainIsLocked(state, chain.id) || (state.runner.enabled && chain.id === state.runner.activeChainId)) return reject("Pause before resetting the active chain");
      for (const prompt of chain.prompts.slice(index)) {
        prompt.status = "queued";
        prompt.attempts = 0;
        prompt.submittedAt = null;
        prompt.completedAt = null;
        prompt.error = null;
      }
      chain.updatedAt = nowISO();
    } else if (type === "SKIP_PROMPT") {
      const owner = payload.promptId ? findChainForPrompt(state, payload.promptId) : getRunnerChain(state);
      const prompt = owner?.prompts.find((item) => item.id === (payload.promptId || state.runner.pendingPromptId)) || nextQueuedPrompt(owner);
      if (!owner || !prompt) return reject("No prompt to skip");
      prompt.status = "skipped";
      prompt.error = null;
      if (state.runner.pendingPromptId === prompt.id) {
        state.runner.pendingPromptId = null;
        state.runner.boundPageKey = null;
        state.runner.nextTarget = null;
        state.runner.enabled = false;
        state.runner.phase = PHASES.PAUSED;
      }
    } else if (type === "SKIP_CHAIN") {
      if (!chain) return reject("Chain not found");
      if (chainIsLocked(state, chain.id)) {
        for (const prompt of chain.prompts) if (["queued", "error", "pending"].includes(prompt.status)) prompt.status = "skipped";
        state.runner.pendingPromptId = null;
        state.runner.boundPageKey = null;
        state.runner.enabled = false;
        state.runner.phase = PHASES.PAUSED;
      } else {
        for (const prompt of chain.prompts) if (["queued", "error"].includes(prompt.status)) prompt.status = "skipped";
      }
    } else if (type === "RETRY_PROMPT") {
      const owner = findChainForPrompt(state, payload.promptId);
      const prompt = owner?.prompts.find((item) => item.id === payload.promptId);
      if (!prompt || prompt.status !== "error") return reject("Only an errored prompt can be retried");
      prompt.status = "queued";
      prompt.error = null;
      state.selectedChainId = owner.id;
    } else {
      return reject(`Unknown command: ${type || "(empty)"}`);
    }
    ensureStackOrder(state);
    syncLegacyAliases(state);
    state.revision = Number(state.revision || 0) + 1;
    state.updatedAt = nowISO();
    state.runner.revision = Number(state.runner.revision || 0) + 1;
    state.runner.updatedAt = nowISO();
    return result;
  }

  function classifyHostSnapshot(snapshot) {
    const header = String(snapshot?.lastHeader || "");
    const errorText = String(snapshot?.errorText || "");
    const busy = !!snapshot?.busy || /\bRunning for\s+\d+s\b|\bAssembling\b|\bThinking\b/i.test(header);
    const failed = !!snapshot?.retryVisible || /\bCanceled\b|\bFailed\b|\bError\b/i.test(header) || /internal error|unexpected error|failed/i.test(errorText);
    const success = !failed && /\bRan for\s+\d+s\b|\bCompleted\b/i.test(header);
    return { ...snapshot, busy, failed, success, state: failed ? "failed" : busy ? "running" : success ? "complete" : "idle" };
  }

  function decideRunnerTransition(runner, hostInput, settings, now = Date.now()) {
    const host = classifyHostSnapshot(hostInput);
    const phase = runner.phase;
    const submittedAt = Number(runner.submittedAt) || 0;
    const newTurn = Number(host.turnCount || 0) > Number(runner.baselineTurnCount || 0);
    const elapsed = submittedAt ? now - submittedAt : 0;

    if ([PHASES.IDLE, PHASES.READY, PHASES.PAUSED, PHASES.DONE, PHASES.ERROR].includes(phase)) return { action: "none", host };
    if (phase === PHASES.PACING) {
      return now >= Number(runner.nextActionAt || 0) ? { action: "pacing_complete", phase: PHASES.READY, host } : { action: "none", host };
    }
    if (phase === PHASES.RETRY_WAIT) {
      if (newTurn && host.busy) return { action: "mark_running", phase: PHASES.RUNNING, host };
      if (now >= Number(runner.nextActionAt || 0) && host.retryVisible) return { action: "retry_now", host };
      if (elapsed > Number(settings.completionTimeoutMs)) return { action: "timeout", message: "Retry did not restart", host };
      return { action: "none", host };
    }
    if (newTurn && host.failed) {
      if (settings.autoRetry && Number(runner.retryCount || 0) < Number(settings.maxRetries || 0) && host.retryVisible) return { action: "schedule_retry", phase: PHASES.RETRY_WAIT, host };
      return { action: "pause_for_failure", phase: PHASES.PAUSED, message: host.errorText || "AI Studio run failed", host };
    }
    if (newTurn && host.busy && !runner.sawBusy) return { action: "mark_running", phase: PHASES.RUNNING, host };
    if (newTurn && host.success) {
      if (phase !== PHASES.SETTLING) return { action: "begin_settle", phase: PHASES.SETTLING, host };
      if (now >= Number(runner.settleUntil || 0)) return { action: "complete_prompt", host };
    }
    if (phase === PHASES.SETTLING && host.busy) return { action: "mark_running", phase: PHASES.RUNNING, host };
    if ([PHASES.AWAITING, PHASES.SUBMITTING].includes(phase) && elapsed > Number(settings.startTimeoutMs)) return { action: "timeout", message: "AI Studio did not start the submitted prompt", host };
    if ([PHASES.AWAITING, PHASES.RUNNING, PHASES.SETTLING].includes(phase) && elapsed > Number(settings.completionTimeoutMs)) return { action: "timeout", message: "AI Studio prompt exceeded the completion timeout", host };
    return { action: "none", host };
  }

  const api = {
    SCHEMA_VERSION,
    PHASES,
    PROMPT_STATUSES,
    nowISO,
    uid,
    normalizeText,
    hashText,
    parsePromptPack,
    defaultSettings,
    defaultRunner,
    defaultState,
    migrateState,
    syncLegacyAliases,
    makeChain,
    makeQueue,
    normalizeChain,
    normalizePrompt,
    getChainById,
    getSelectedChain,
    getActiveQueue,
    getRunnerChain,
    getRunnerPrompt,
    findChainForPrompt,
    nextQueuedPrompt,
    nextStackTarget,
    nextChainTarget,
    chainCounts,
    queueCounts,
    chainStatus,
    stackCounts,
    applyCommand,
    classifyHostSnapshot,
    decideRunnerTransition
  };

  global.AISQCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
