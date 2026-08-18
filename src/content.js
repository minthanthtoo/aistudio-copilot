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
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const textOf = (node) => String(node?.textContent || "").replace(/\s+/g, " ").trim();

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

  function visible(node) {
    if (!(node instanceof Element)) return false;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
  }

  function visibleAll(selector, scope = document) {
    return Array.from(scope.querySelectorAll(selector)).filter(visible);
  }

  function exactButton(label, scope = document) {
    const suffix = new RegExp(`(?:^|\\s)${String(label).replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}$`, "i");
    return visibleAll("button", scope).find((button) => {
      const aria = String(button.getAttribute("aria-label") || "").trim();
      const title = String(button.getAttribute("title") || "").trim();
      return aria.toLowerCase() === String(label).toLowerCase() || title.toLowerCase() === String(label).toLowerCase() || suffix.test(textOf(button));
    }) || null;
  }

  function enabled(control) {
    return !!control && !control.disabled && control.getAttribute("aria-disabled") !== "true" && !control.classList.contains("disabled");
  }

  async function waitForElement(getter, timeoutMs = 2500, stepMs = 100) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const element = getter();
      if (element) return element;
      await sleep(stepMs);
    }
    return null;
  }

  function setNativeValue(control, value) {
    const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) throw new Error("Unable to find native value setter");
    control.focus();
    setter.call(control, value);
    const InputEventClass = globalThis.InputEvent || Event;
    control.dispatchEvent(new InputEventClass("input", { bubbles: true, inputType: "insertText", data: value }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }

  let textStash = null;
  let activeCountdown = null;

  function stashText() {
    const ta = scanHost().textarea;
    if (!ta) return;
    const original = ta.value ?? "";
    if (!original.trim()) return;
    textStash = { original, selStart: ta.selectionStart, selEnd: ta.selectionEnd };
    setNativeValue(ta, "");
  }

  function restoreText() {
    if (!textStash) return;
    const ta = scanHost().textarea;
    if (!ta) return;
    setNativeValue(ta, textStash.original);
    try {
      ta.focus();
      ta.setSelectionRange(textStash.selStart ?? textStash.original.length, textStash.selEnd ?? textStash.original.length);
    } catch {}
    textStash = null;
  }

  function robustClick(btn) {
    if (!btn) return false;
    try { btn.scrollIntoView({ block: "center", inline: "center" }); btn.focus?.(); } catch {}
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const pe = (type) => new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: "mouse", isPrimary: true, clientX: x, clientY: y, button: 0, buttons: type === "pointerdown" ? 1 : 0 });
    const me = (type) => new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons: type === "mousedown" ? 1 : 0 });
    try {
      btn.dispatchEvent(pe("pointerover")); btn.dispatchEvent(me("mouseover"));
      btn.dispatchEvent(pe("pointerdown")); btn.dispatchEvent(me("mousedown"));
      btn.dispatchEvent(pe("pointerup")); btn.dispatchEvent(me("mouseup"));
      btn.dispatchEvent(me("click"));
      return true;
    } catch {
      try { btn.click(); return true; } catch { return false; }
    }
  }

  function findRetryButton(scope = document) {
    const callouts = visibleAll("ms-error-callout, ms-chat-turn-error", scope).reverse();
    for (const callout of callouts) {
      const retry = visibleAll("button", callout).find((button) => textOf(button) === "Retry");
      if (retry) return retry;
    }
    return null;
  }

  function scanHost() {
    const editorTextarea = visibleAll('ms-code-assistant-chat textarea[placeholder="Make changes, add new features, ask for anything"]')[0] ||
      visibleAll('textarea[placeholder="Make changes, add new features, ask for anything"]')[0] || null;
    const startTextarea = visibleAll('textarea[placeholder="Describe an app and let Gemini do the rest"]')[0] || null;
    const mode = editorTextarea ? "editor" : startTextarea ? "start" : "unsupported";
    const textarea = editorTextarea || startTextarea;
    const submit = mode === "editor"
      ? visibleAll('ms-code-assistant-chat button[aria-label="Send"]')[0] || visibleAll('button[aria-label="Send"]')[0] || null
      : mode === "start" ? visibleAll("button.build-button")[0] || exactButton("Build") : null;
    const turns = visibleAll("ms-code-assistant-chat .turn-container > .turn");
    const lastTurn = turns.at(-1) || null;
    const lastHeader = textOf(lastTurn?.querySelector(".turn-header"));
    const retry = lastTurn ? findRetryButton(lastTurn) : null;
    const errorText = textOf(lastTurn?.querySelector("ms-error-callout, ms-chat-turn-error"));
    const transientActivity = lastTurn ? Array.from(lastTurn.querySelectorAll("*")).some((node) => visible(node) && /^(?:Assembling|Thinking|Applying file changes|Generating(?: design)? previews?)(?:…|\.\.\.)?$/i.test(textOf(node))) : false;
    const busy = /\bRunning for\s+\d+s\b/i.test(lastHeader) || transientActivity;
    const dialogs = visibleAll('[role="dialog"], mat-dialog-container');
    const blockingDialog = dialogs.find((dialog) => !rootHost?.contains(dialog) && /guided tour|welcome|sign in|consent/i.test(textOf(dialog))) || null;
    return Core.classifyHostSnapshot({
      mode,
      textarea,
      submit,
      submitReady: enabled(submit),
      turnCount: turns.length,
      lastHeader,
      errorText,
      retryVisible: !!retry,
      retry,
      busy,
      blocked: !!blockingDialog,
      blockedReason: blockingDialog ? textOf(blockingDialog).slice(0, 180) : ""
    });
  }

  function selectedChain() { return Core.getSelectedChain(state); }
  function runnerChain() { return Core.getRunnerChain(state); }
  function runnerPrompt() { return Core.getRunnerPrompt(state); }

  function currentPageKey() {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts[0] === "apps") return `/${parts.slice(0, 2).join("/")}`;
    return location.pathname || "/";
  }

  function pageMatchesBinding() {
    return !state.runner.boundPageKey || state.runner.boundPageKey === currentPageKey();
  }

  function addHistory(kind, message, data = null) {
    state.history.push({ at: Core.nowISO(), kind, message, data });
    state.history = state.history.slice(-300);
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
      const current = await chrome.storage.local.get(STORAGE_KEY);
      const stored = current?.[STORAGE_KEY] ? Core.migrateState(current[STORAGE_KEY]) : null;
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
      await chrome.storage.local.set({ [STORAGE_KEY]: snapshot, [LEGACY_STORAGE_KEY]: snapshot });
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
    if (!state.runner.enabled && state.runner.phase === PHASES.PAUSED) releaseRunnerLease();
    scheduleSave();
    requestRender();
    return result;
  }

  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      const active = shadow?.activeElement;
      if (!active || !active.matches?.("input, textarea, select")) render();
    });
  }

  function leaseExpired() {
    const stamp = Date.parse(state.runner.leaseUpdatedAt || "") || 0;
    return !state.runner.ownerTabId || state.runner.ownerTabId === tabId || Date.now() - stamp > LEASE_MS;
  }

  function canRun() {
    return !runnerOwnedByOtherTab && (leaseToken || leaseExpired() || state.runner.ownerTabId === tabId);
  }

  function claimLocalLease() {
    if (!canRun()) {
      runnerOwnedByOtherTab = true;
      return false;
    }
    state.runner.ownerTabId = tabId;
    state.runner.leaseUpdatedAt = Core.nowISO();
    runnerOwnedByOtherTab = false;
    return true;
  }

  function sendRuntimeMessage(message, timeoutMs = 1500) {
    if (!chrome.runtime?.sendMessage) return Promise.resolve(null);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(value || null);
      };
      const timeout = setTimeout(() => finish(null), timeoutMs);
      try {
        const promise = chrome.runtime.sendMessage(message, (response) => {
          void chrome.runtime.lastError;
          finish(response);
        });
        if (promise && typeof promise.then === "function") promise.then(finish, () => finish(null));
      } catch {
        finish(null);
      }
    });
  }

  async function acquireRunnerLease() {
    if (!chrome.runtime?.sendMessage) {
      const acquired = claimLocalLease();
      if (acquired) leaseToken = `local-${tabId}`;
      return acquired;
    }
    const response = await sendRuntimeMessage({ type: "AISQ_LEASE_ACQUIRE", leaseMs: LEASE_MS });
    if (!response?.ok) {
      runnerOwnedByOtherTab = true;
      state.runner.ownerTabId = response?.ownerTabId !== undefined && response?.ownerTabId !== null ? String(response.ownerTabId) : state.runner.ownerTabId;
      return false;
    }
    leaseToken = response.token;
    lastLeaseHeartbeatAt = Date.now();
    state.runner.ownerTabId = tabId;
    state.runner.leaseUpdatedAt = Core.nowISO();
    runnerOwnedByOtherTab = false;
    return true;
  }

  async function heartbeatRunnerLease() {
    if (!chrome.runtime?.sendMessage) {
      state.runner.leaseUpdatedAt = Core.nowISO();
      return true;
    }
    if (!leaseToken) return acquireRunnerLease();
    if (Date.now() - lastLeaseHeartbeatAt < Math.floor(LEASE_MS / 4)) return true;
    const response = await sendRuntimeMessage({ type: "AISQ_LEASE_HEARTBEAT", token: leaseToken, leaseMs: LEASE_MS });
    if (!response?.ok) {
      leaseToken = null;
      runnerOwnedByOtherTab = true;
      state.runner.enabled = false;
      state.runner.phase = PHASES.PAUSED;
      state.runner.ownerTabId = response?.ownerTabId !== undefined && response?.ownerTabId !== null ? String(response.ownerTabId) : null;
      state.runner.leaseUpdatedAt = null;
      state.runner.lastError = "Runner lease was lost to another AI Studio tab; execution paused before the next action";
      addHistory("lease_lost", state.runner.lastError);
      touchState();
      scheduleSave();
      requestRender();
      return false;
    }
    lastLeaseHeartbeatAt = Date.now();
    state.runner.leaseUpdatedAt = Core.nowISO();
    touchState();
    scheduleSave();
    return true;
  }

  function releaseRunnerLease() {
    const token = leaseToken;
    leaseToken = null;
    lastLeaseHeartbeatAt = 0;
    runnerOwnedByOtherTab = false;
    if (chrome.runtime?.sendMessage && token) void sendRuntimeMessage({ type: "AISQ_LEASE_RELEASE", token }, 800);
  }

  function nextTarget() {
    const options = { selectedOnly: state.runner.scope === "selected" };
    if (state.runner.scope === "selected") options.startChainId = state.runner.scopeChainId || state.runner.activeChainId || state.selectedChainId;
    return Core.nextStackTarget(state, options);
  }

  function markPromptError(message) {
    const prompt = runnerPrompt();
    if (prompt) {
      prompt.status = "error";
      prompt.error = message;
    }
    state.runner.phase = PHASES.PAUSED;
    state.runner.enabled = false;
    state.runner.lastError = message;
    state.runner.nextTarget = null;
    state.runner.ownerTabId = null;
    state.runner.leaseUpdatedAt = null;
    releaseRunnerLease();
    addHistory("error", message, { promptId: prompt?.id || null });
    touchState();
  }

  function finishRun(message = "Stack completed") {
    state.runner.phase = PHASES.DONE;
    state.runner.enabled = false;
    state.runner.pendingPromptId = null;
    state.runner.nextTarget = null;
    state.runner.scopeChainId = null;
    state.runner.boundPageKey = null;
    state.runner.ownerTabId = null;
    state.runner.leaseUpdatedAt = null;
    releaseRunnerLease();
    addHistory("stack_done", message);
    if (state.settings.autoDownloadOnDone) void downloadZip();
  }

  function beginSubmission(host) {
    const target = nextTarget();
    if (!target) {
      finishRun();
      return;
    }
    const { chain, prompt } = target;
    if (host.mode === "unsupported") {
      state.runner.lastHostState = "Open AI Studio Apps start or editor page";
      return;
    }
    if (host.blocked) {
      state.runner.lastHostState = `Blocked: ${host.blockedReason}`;
      return;
    }
    if (host.busy) {
      state.runner.lastHostState = "Waiting for the current AI Studio run to finish";
      return;
    }
    state.runner.activeChainId = chain.id;
    state.runner.pendingPromptId = prompt.id;
    state.runner.boundPageKey = currentPageKey();
    prompt.status = "pending";
    prompt.attempts = Number(prompt.attempts || 0) + 1;
    prompt.submittedAt = Core.nowISO();
    prompt.error = null;
    state.runner.phase = PHASES.SUBMITTING;
    state.runner.baselineTurnCount = host.turnCount;
    state.runner.submittedAt = Date.now();
    state.runner.clickedAt = null;
    state.runner.sawBusy = false;
    state.runner.settleUntil = null;
    state.runner.retryCount = 0;
    state.runner.lastError = null;
    addHistory("prepared", `Prepared ${prompt.label}`, { chainId: chain.id, promptId: prompt.id, mode: host.mode });
    try {
      setNativeValue(host.textarea, prompt.text);
      state.runner.nextActionAt = Date.now() + 150;
      touchState();
      scheduleSave();
    } catch (error) {
      prompt.status = "error";
      markPromptError(`Could not fill AI Studio composer: ${error.message}`);
      scheduleSave();
    }
  }

  async function finishSubmission(host) {
    const prompt = runnerPrompt();
    if (!prompt) return markPromptError("Pending prompt could not be found");
    if (!host.textarea || !host.submit) {
      if (Date.now() - Number(state.runner.submittedAt || 0) > state.settings.startTimeoutMs) markPromptError("AI Studio composer disappeared before submission");
      return;
    }
    if (host.textarea.value !== prompt.text) {
      setNativeValue(host.textarea, prompt.text);
      state.runner.nextActionAt = Date.now() + 150;
      return;
    }
    if (Date.now() < Number(state.runner.nextActionAt || 0) || !host.submitReady) return;
    const intendedPromptId = prompt.id;
    state.runner.clickedAt = Date.now();
    state.runner.submittedAt = Date.now();
    state.runner.phase = PHASES.AWAITING;
    state.runner.lastHostState = "Submission committed; waiting for a new assistant turn";
    addHistory("submission_committed", `Committed ${prompt.label} before host click`, { chainId: state.runner.activeChainId, promptId: prompt.id, mode: host.mode });
    touchState();
    const persisted = await saveNow();
    if (!persisted || state.runner.pendingPromptId !== intendedPromptId || !state.runner.enabled) return;
    host.submit.click();
    addHistory("submitted", `Submitted ${prompt.label}`, { chainId: state.runner.activeChainId, promptId: prompt.id, mode: host.mode });
    touchState();
    scheduleSave();
  }

  async function applyTransition(decision, host) {
    const prompt = runnerPrompt();
    const chain = runnerChain();
    switch (decision.action) {
      case "mark_running":
        state.runner.phase = PHASES.RUNNING;
        state.runner.sawBusy = true;
        state.runner.lastHostState = host.lastHeader || "AI Studio is running";
        break;
      case "begin_settle":
        state.runner.phase = PHASES.SETTLING;
        state.runner.settleUntil = Date.now() + state.settings.settleMs;
        state.runner.lastHostState = host.lastHeader || "Completed; verifying stable state";
        break;
      case "complete_prompt": {
        if (!prompt || !chain) return markPromptError("Completion arrived without a pending prompt");
        prompt.status = "complete";
        prompt.completedAt = Core.nowISO();
        prompt.error = null;
        chain.updatedAt = Core.nowISO();
        addHistory("completed", `Completed ${prompt.label}`, { chainId: chain.id, promptId: prompt.id, header: host.lastHeader });
        state.runner.pendingPromptId = null;
        state.runner.retryCount = 0;
        const target = nextTarget();
        state.runner.nextTarget = target ? { chainId: target.chain.id, promptId: target.prompt.id } : null;
        const sameChain = target && target.chain.id === chain.id;
        if (!target) {
          finishRun();
        } else if (state.settings.stopAfterChain && !sameChain) {
          state.runner.phase = PHASES.PAUSED;
          state.runner.enabled = false;
          state.runner.lastHostState = "Chain complete; stopped before the next chain";
          state.runner.ownerTabId = null;
          releaseRunnerLease();
          addHistory("chain_pause", `Stopped after ${chain.name}`);
        } else if (state.settings.autoRun) {
          state.runner.phase = PHASES.PACING;
          state.runner.nextActionAt = Date.now() + (sameChain ? state.settings.interPromptDelayMs : state.settings.interChainDelayMs);
        } else {
          state.runner.phase = PHASES.PAUSED;
          state.runner.enabled = false;
          state.runner.nextActionAt = null;
          state.runner.lastHostState = "Prompt complete; manual Resume is enabled";
          state.runner.ownerTabId = null;
          releaseRunnerLease();
        }
        break;
      }
      case "schedule_retry":
        stashText();
        state.runner.phase = PHASES.RETRY_WAIT;
        state.runner.retryCount = Number(state.runner.retryCount || 0) + 1;
        state.runner.nextActionAt = Date.now() + state.settings.retryDelayMs;
        state.runner.lastError = host.errorText || host.lastHeader || "AI Studio failed";
        addHistory("retry_scheduled", `Retry ${state.runner.retryCount}/${state.settings.maxRetries} scheduled`, { promptId: prompt?.id || null });
        break;
      case "retry_now":
        if (!host.retry || !visible(host.retry)) return markPromptError("Retry control disappeared");
        state.runner.baselineTurnCount = host.turnCount;
        state.runner.submittedAt = Date.now();
        state.runner.sawBusy = false;
        state.runner.phase = PHASES.AWAITING;
        if (prompt) prompt.attempts = Number(prompt.attempts || 0) + 1;
        touchState();
        if (!await saveNow() || state.runner.pendingPromptId !== prompt?.id || !state.runner.enabled) break;
        host.retry.click();
        setTimeout(restoreText, 2600);
        addHistory("retry_clicked", `Clicked Retry ${state.runner.retryCount}/${state.settings.maxRetries}`, { promptId: prompt?.id || null });
        break;
      case "pause_for_failure": {
        const policy = state.settings.failurePolicy || "pause";
        if (policy === "skip_prompt" && prompt) {
          prompt.status = "skipped";
          prompt.error = decision.message || host.errorText || "Skipped after failure";
          state.runner.pendingPromptId = null;
          const target = nextTarget();
          state.runner.nextTarget = target ? { chainId: target.chain.id, promptId: target.prompt.id } : null;
          if (!target) finishRun("Stack completed after skipping a failed prompt");
          else if (state.settings.autoRun) {
            state.runner.phase = PHASES.PACING;
            state.runner.nextActionAt = Date.now() + state.settings.interPromptDelayMs;
          } else {
            state.runner.enabled = false;
            state.runner.phase = PHASES.PAUSED;
            state.runner.ownerTabId = null;
            releaseRunnerLease();
          }
          addHistory("failure_skipped", `Skipped failed prompt ${prompt.label}`);
        } else if (policy === "skip_chain" && chain) {
          for (const item of chain.prompts) if (["queued", "error", "pending"].includes(item.status)) item.status = "skipped";
          state.runner.pendingPromptId = null;
          const target = nextTarget();
          state.runner.nextTarget = target ? { chainId: target.chain.id, promptId: target.prompt.id } : null;
          if (!target) finishRun("Stack completed after skipping a failed chain");
          else if (state.settings.autoRun) {
            state.runner.phase = PHASES.PACING;
            state.runner.nextActionAt = Date.now() + state.settings.interChainDelayMs;
          } else {
            state.runner.enabled = false;
            state.runner.phase = PHASES.PAUSED;
            state.runner.ownerTabId = null;
            releaseRunnerLease();
          }
          addHistory("failure_chain_skipped", `Skipped failed chain ${chain.name}`);
        } else {
          markPromptError(decision.message || "AI Studio run failed");
        }
        break;
      }
      case "timeout":
        markPromptError(decision.message || "AI Studio run failed");
        break;
      case "pacing_complete":
        state.runner.phase = state.settings.autoRun ? PHASES.READY : PHASES.PAUSED;
        state.runner.enabled = !!state.settings.autoRun;
        state.runner.nextActionAt = null;
        break;
      default:
        break;
    }
    if (decision.action !== "none") touchState();
  }

  function clickOptInControls() {
    let changed = false;

    // Auto-allow
    if (state.settings.autoAllowAccess && (!activeCountdown || activeCountdown.type === "allow")) {
      const allow = visibleAll("button").find((button) => /^Allow access$/i.test(textOf(button)));
      if (allow && enabled(allow) && !clickedOptInControls.has(allow)) {
        if (!activeCountdown) {
          activeCountdown = { type: "allow", button: allow, expires: Date.now() + 3000 };
          requestRender();
        } else if (Date.now() >= activeCountdown.expires) {
          clickedOptInControls.add(allow);
          allow.click();
          addHistory("host_action", "Clicked Allow access");
          activeCountdown = null;
          changed = true;
          requestRender();
        }
      } else if (activeCountdown?.type === "allow") {
        activeCountdown = null;
        requestRender();
      }
    }

    // Auto-fix
    if (state.settings.autoFix && (!activeCountdown || activeCountdown.type === "autofix")) {
      const fix = visibleAll("button").find((button) => /^(Auto-fix|Autofix|Auto fix|Fix error)$/i.test(textOf(button)));
      if (fix && enabled(fix) && !clickedOptInControls.has(fix)) {
        if (!activeCountdown) {
          stashText();
          activeCountdown = { type: "autofix", button: fix, expires: Date.now() + 3000 };
          requestRender();
        } else if (Date.now() >= activeCountdown.expires) {
          clickedOptInControls.add(fix);
          robustClick(fix);
          addHistory("host_action", `Clicked ${textOf(fix)}`);
          activeCountdown = null;
          setTimeout(restoreText, 2600);
          changed = true;
          requestRender();
        }
      } else if (activeCountdown?.type === "autofix") {
        restoreText();
        activeCountdown = null;
        requestRender();
      }
    }

    return changed;
  }

  let countdownBadge = null;
  function renderCountdowns() {
    let text = null;
    let targetBtn = null;
    let msLeft = 0;
    if (activeCountdown && activeCountdown.button) {
      msLeft = activeCountdown.expires - Date.now();
      targetBtn = activeCountdown.button;
      text = activeCountdown.type === "autofix" ? "Auto-fix" : "Allow";
    } else if (state.runner.phase === PHASES.RETRY_WAIT && state.runner.nextActionAt) {
      msLeft = state.runner.nextActionAt - Date.now();
      const host = scanHost();
      targetBtn = host.retry;
      text = "Retry";
    }
    if (!targetBtn || msLeft < 0) {
      if (countdownBadge) { countdownBadge.remove(); countdownBadge = null; }
      return;
    }
    if (!countdownBadge) {
      countdownBadge = el("div", { className: "aisq-badge" });
      shadow.append(countdownBadge);
    }
    countdownBadge.textContent = `${text} in ${(msLeft / 1000).toFixed(1)}s`;
    const r = targetBtn.getBoundingClientRect();
    countdownBadge.style.top = `${Math.max(8, r.top - 34)}px`;
    countdownBadge.style.left = `${Math.min(window.innerWidth - 8, r.right) - 10}px`;
    countdownBadge.style.transform = "translateX(-100%)";
  }

  async function tick() {
    if (tickBusy) return;
    tickBusy = true;
    try {
      const host = scanHost();
      const signature = [host.mode, host.submitReady, host.turnCount, host.lastHeader, host.retryVisible, host.blocked].join("|");
      if (signature !== lastHostSignature) {
        lastHostSignature = signature;
        state.runner.lastHostState = host.blocked ? `Blocked: ${host.blockedReason}` : `${host.mode}: ${host.state}`;
        requestRender();
      }
      if (clickOptInControls()) requestRender();
      renderCountdowns();
      if (state.runner.pendingPromptId && leaseToken && state.runner.ownerTabId === tabId) {
        const currentKey = currentPageKey();
        if (state.runner.boundPageKey === "/apps" && currentKey.startsWith("/apps/")) {
          state.runner.boundPageKey = currentKey;
          touchState();
          scheduleSave();
        } else if (!pageMatchesBinding()) {
          state.runner.enabled = false;
          state.runner.phase = PHASES.PAUSED;
          state.runner.ownerTabId = null;
          state.runner.leaseUpdatedAt = null;
          state.runner.lastError = `Pending work is bound to ${state.runner.boundPageKey}; open that AI Studio app before resuming`;
          releaseRunnerLease();
          touchState();
          scheduleSave();
          requestRender();
          return;
        }
      }
      if (!state.runner.enabled) {
        if (state.runner.pendingPromptId && leaseToken) await heartbeatRunnerLease();
        return;
      }
      if (!leaseToken) {
        if (state.runner.pendingPromptId && state.runner.ownerTabId && state.runner.ownerTabId !== tabId) {
          runnerOwnedByOtherTab = true;
          state.runner.lastHostState = "Pending work remains owned by another AI Studio tab";
          requestRender();
          return;
        }
        if (!await acquireRunnerLease()) {
          state.runner.lastHostState = "Runner is owned by another AI Studio tab";
          requestRender();
          return;
        }
        touchState();
        scheduleSave();
      }
      if (!await heartbeatRunnerLease()) return;
      if (clickOptInControls()) {
        touchState();
        scheduleSave();
      }
      if (state.runner.phase === PHASES.READY) beginSubmission(host);
      else if (state.runner.phase === PHASES.SUBMITTING) await finishSubmission(host);
      else {
        const decision = Core.decideRunnerTransition(state.runner, host, state.settings, Date.now());
        if (decision.action !== "none") await applyTransition(decision, host);
      }
      requestRender();
    } catch (error) {
      markPromptError(`Queue Pilot error: ${error.message}`);
      scheduleSave();
    } finally {
      tickBusy = false;
    }
  }

  async function startRunner(scope = "stack") {
    if (state.runner.enabled) {
      mutate(() => { state.runner.lastError = "Pause the current runner before changing its execution scope"; });
      return;
    }
    const candidateState = state;
    const target = Core.nextStackTarget(candidateState, scope === "selected" ? { selectedOnly: true, startChainId: state.selectedChainId } : {});
    if (!target && !state.runner.pendingPromptId) {
      mutate(() => { state.runner.lastError = "Add at least one queued prompt to the selected run scope first"; });
      return;
    }
    if (!await acquireRunnerLease()) {
      mutate(() => { state.runner.lastError = "Another AI Studio tab owns the runner"; });
      return;
    }
    mutate(() => {
      state.runner.scope = scope;
      state.runner.scopeChainId = scope === "selected" ? state.selectedChainId : null;
      state.runner.enabled = true;
      state.runner.phase = state.runner.pendingPromptId ? PHASES.AWAITING : PHASES.READY;
      state.runner.lastError = null;
      state.runner.ownerTabId = tabId;
      state.runner.leaseUpdatedAt = Core.nowISO();
      addHistory("runner_started", scope === "selected" ? "Selected chain runner started" : "Stack runner started");
    });
    void tick();
  }

  function pauseRunner() {
    if (state.runner.enabled && !leaseToken) {
      mutate(() => { state.runner.lastError = "Only the tab that owns this runner can pause it"; });
      return;
    }
    const retainPendingLease = !!state.runner.pendingPromptId;
    if (!retainPendingLease) releaseRunnerLease();
    mutate(() => {
      state.runner.enabled = false;
      state.runner.phase = PHASES.PAUSED;
      state.runner.ownerTabId = retainPendingLease ? tabId : null;
      state.runner.leaseUpdatedAt = retainPendingLease ? Core.nowISO() : null;
      addHistory("runner_paused", "Runner paused");
    });
  }

  async function resumeRunner() {
    if (state.runner.pendingPromptId && !pageMatchesBinding()) {
      mutate(() => { state.runner.lastError = `Pending work is bound to ${state.runner.boundPageKey}; open that AI Studio app before resuming`; });
      return;
    }
    if (!await acquireRunnerLease()) {
      mutate(() => { state.runner.lastError = "Another AI Studio tab owns the runner"; });
      return;
    }
    mutate(() => {
      state.runner.enabled = true;
      state.runner.ownerTabId = tabId;
      state.runner.leaseUpdatedAt = Core.nowISO();
      if (state.runner.pendingPromptId) {
        const host = scanHost();
        state.runner.baselineTurnCount = Math.min(state.runner.baselineTurnCount, host.turnCount);
        state.runner.phase = host.retryVisible ? PHASES.RETRY_WAIT : PHASES.AWAITING;
        state.runner.nextActionAt = host.retryVisible ? Date.now() : null;
      } else state.runner.phase = PHASES.READY;
      state.runner.lastError = null;
      addHistory("runner_resumed", "Runner resumed");
    });
    void tick();
  }

  async function recoverPendingHere() {
    if (!state.runner.pendingPromptId) return;
    const currentKey = currentPageKey();
    let recoveredPageKey = null;
    if (state.runner.boundPageKey === "/apps" && currentKey.startsWith("/apps/")) {
      if (!confirm("Recover the pending start-page submission in this app? Only continue if this is the app created by that submission.")) return;
      recoveredPageKey = currentKey;
    } else if (!pageMatchesBinding()) {
      mutate(() => { state.runner.lastError = `This pending prompt belongs to ${state.runner.boundPageKey}, not ${currentKey}`; });
      return;
    }
    if (!await acquireRunnerLease()) {
      mutate(() => { state.runner.lastError = "The original runner tab is still active; recover from that tab or wait for its lease to expire"; });
      return;
    }
    mutate(() => {
      const host = scanHost();
      if (recoveredPageKey) state.runner.boundPageKey = recoveredPageKey;
      state.runner.enabled = true;
      state.runner.ownerTabId = tabId;
      state.runner.leaseUpdatedAt = Core.nowISO();
      state.runner.phase = host.retryVisible ? PHASES.RETRY_WAIT : PHASES.AWAITING;
      state.runner.nextActionAt = host.retryVisible ? Date.now() : null;
      state.runner.lastError = null;
      addHistory("runner_recovered", "Pending runner explicitly recovered in its bound app");
    });
    void tick();
  }

  function skipPrompt() {
    if (state.runner.enabled && !leaseToken) {
      mutate(() => { state.runner.lastError = "Only the owner tab can skip the running prompt"; });
      return;
    }
    const prompt = runnerPrompt() || Core.nextStackTarget(state, state.runner.scope === "selected" ? { selectedOnly: true, startChainId: state.selectedChainId } : {})?.prompt;
    if (!prompt) return;
    const result = command("SKIP_PROMPT", { promptId: prompt.id }, { history: { kind: "skipped", message: `Skipped ${prompt.label}`, data: { promptId: prompt.id } } });
    if (result.ok) void tick();
  }

  function resetSelectedChain() {
    const chain = selectedChain();
    if (!chain) return;
    if (!confirm(`Reset all prompts in ${chain.name}?`)) return;
    command("RESET_CHAIN", { chainId: chain.id }, { history: { kind: "chain_reset", message: `Reset ${chain.name}` } });
  }

  async function downloadZip() {
    try {
      const directBtn = visibleAll('button[aria-label="Download app"][iconname="download"], button[aria-label="Download app"]')[0];
      if (directBtn) {
        directBtn.click();
        addHistory("download", "Requested direct app download");
        return;
      }
    } catch {}
    if (exportStep) return;
    exportStep = "Opening Code view";
    requestRender();
    try {
      const code = exactButton("Code");
      if (code) code.click();
      exportStep = "Opening export menu";
      requestRender();
      const exportButton = await waitForElement(() => visibleAll('button[aria-label="Export options"]')[0], 3000);
      if (!exportButton) throw new Error("Export options is unavailable; open an app editor first");
      const findZipItem = () => visibleAll('[role="menuitem"], button').find((node) => /^Download as \.zip file\b/i.test(textOf(node))) || null;
      let zip = findZipItem();
      if (!zip && exportButton.getAttribute("aria-expanded") !== "true") exportButton.click();
      zip = zip || await waitForElement(findZipItem, 1800);
      if (!zip) {
        if (exportButton.getAttribute("aria-expanded") === "true") {
          exportButton.click();
          await sleep(150);
        }
        exportButton.click();
        zip = await waitForElement(findZipItem, 2200);
      }
      if (!zip) throw new Error("Download as .zip file menu item was not found");
      exportStep = "Choosing ZIP archive";
      zip.click();
      addHistory("download", "Requested app ZIP download");
      state.runner.lastError = null;
    } catch (error) {
      state.runner.lastError = error.message;
      addHistory("download_error", error.message);
    } finally {
      exportStep = null;
      touchState();
      scheduleSave();
      requestRender();
    }
  }

  function createDiagnosticSnapshot() {
    const order = new Map(state.stackOrder.map((id, index) => [id, index]));
    const chainRefs = new Map(state.chains.map((chain, index) => [chain.id, `chain-${index + 1}`]));
    let pendingRef = null;
    const chains = state.chains.map((chain, chainIndex) => ({
      ref: chainRefs.get(chain.id),
      stackPosition: order.has(chain.id) ? order.get(chain.id) + 1 : null,
      splitStrategy: chain.source.splitStrategy,
      createdAt: chain.createdAt,
      updatedAt: chain.updatedAt,
      counts: Core.chainCounts(chain),
      prompts: chain.prompts.map((prompt, promptIndex) => {
        const ref = `${chainRefs.get(chain.id)}.prompt-${promptIndex + 1}`;
        if (prompt.id === state.runner.pendingPromptId) pendingRef = ref;
        return {
          ref,
          status: prompt.status,
          attempts: Number(prompt.attempts || 0),
          textLength: prompt.text.length,
          submittedAt: prompt.submittedAt,
          completedAt: prompt.completedAt,
          hasError: !!prompt.error
        };
      })
    }));
    const host = scanHost();
    return {
      format: "aisq-redacted-diagnostics-v1",
      exportedAt: Core.nowISO(),
      extensionVersion: EXTENSION_VERSION,
      schemaVersion: state.schemaVersion,
      revision: state.revision,
      runner: {
        phase: state.runner.phase,
        enabled: state.runner.enabled,
        scope: state.runner.scope,
        scopeChainRef: chainRefs.get(state.runner.scopeChainId) || null,
        activeChainRef: chainRefs.get(state.runner.activeChainId) || null,
        pendingPromptRef: pendingRef,
        baselineTurnCount: state.runner.baselineTurnCount,
        retryCount: state.runner.retryCount,
        hasLastError: !!state.runner.lastError,
        revision: state.runner.revision,
        updatedAt: state.runner.updatedAt
      },
      settings: clone(state.settings),
      host: {
        mode: host.mode,
        state: host.state,
        busy: host.busy,
        failed: host.failed,
        success: host.success,
        blocked: host.blocked,
        submitReady: host.submitReady,
        retryVisible: host.retryVisible,
        turnCount: host.turnCount
      },
      chains,
      history: state.history.map((entry) => ({ at: entry.at, kind: entry.kind }))
    };
  }

  function downloadDiagnostics() {
    try {
      const snapshot = createDiagnosticSnapshot();
      const blob = new Blob([`${JSON.stringify(snapshot, null, 2)}\n`], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ai-studio-queue-pilot-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      anchor.hidden = true;
      shadow.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      addHistory("diagnostics", "Downloaded redacted diagnostics");
      state.runner.lastError = null;
      touchState();
      scheduleSave();
    } catch (error) {
      mutate(() => {
        state.runner.lastError = `Could not export diagnostics: ${error.message}`;
        addHistory("diagnostics_error", state.runner.lastError);
      });
    }
  }

  function el(tag, options = {}, children = []) {
    const node = document.createElement(tag);
    if (options.className) node.className = options.className;
    if (options.text !== undefined) node.textContent = String(options.text);
    if (options.title) node.title = options.title;
    if (options.type) node.type = options.type;
    if (options.value !== undefined) node.value = String(options.value);
    if (options.placeholder) node.placeholder = options.placeholder;
    if (options.checked !== undefined) node.checked = !!options.checked;
    if (options.disabled !== undefined) node.disabled = !!options.disabled;
    if (options.role) node.setAttribute("role", options.role);
    if (options.ariaLabel) node.setAttribute("aria-label", options.ariaLabel);
    if (options.ariaSelected !== undefined) node.setAttribute("aria-selected", String(!!options.ariaSelected));
    if (options.attrs) for (const [name, value] of Object.entries(options.attrs)) if (value !== undefined && value !== null) node.setAttribute(name, String(value));
    if (options.on) for (const [event, handler] of Object.entries(options.on)) node.addEventListener(event, handler);
    for (const child of Array.isArray(children) ? children : [children]) if (child) node.append(child);
    return node;
  }

  function button(label, handler, kind = "", accessibleLabel = label) {
    return el("button", { className: `aisq-button ${kind}`.trim(), type: "button", text: label, ariaLabel: accessibleLabel, on: { click: handler } });
  }

  function field(label, control, help = "") {
    const wrap = el("label", { className: "aisq-field" }, [el("span", { className: "aisq-label", text: label }), control]);
    if (help) wrap.append(el("span", { className: "aisq-help", text: help }));
    return wrap;
  }

  function importText(raw, strategy = state.ui.splitStrategy, options = {}) {
    const result = Core.parsePromptPack(raw, strategy);
    if (!result.prompts.length) return { ok: false, error: "Nothing to import" };
    const number = state.chains.length + 1;
    const chain = Core.makeChain(options.name || `Chain ${number}`, result.prompts, raw, { splitStrategy: result.strategy, pastedAt: Core.nowISO() });
    const placement = options.placement || state.settings.pastePlacement;
    const commandResult = command("IMPORT_CHAIN", { chain, placement, afterChainId: options.afterChainId || (placement === "after" ? state.selectedChainId : null) }, { history: { kind: "chain_imported", message: `Added ${chain.name} with ${result.prompts.length} prompt(s)`, data: { chainId: chain.id, strategy: result.strategy } } });
    if (commandResult.ok) {
      state.ui.draft = "";
      state.ui.detectedStrategy = result.strategy;
      const draftControl = shadow?.querySelector(".aisq-draft");
      if (draftControl) draftControl.value = "";
      const stackMeter = shadow?.getElementById("aisq-stack-meter");
      if (stackMeter) {
        const counts = Core.stackCounts(state);
        stackMeter.textContent = `Stack now: ${counts.chains} chain(s) · ${counts.prompts} prompt(s) · ${counts.queued} queued`;
      }
      touchState();
      scheduleSave();
      requestRender();
    }
    return commandResult;
  }

  function renderBuild() {
    const draft = el("textarea", {
      className: "aisq-draft",
      value: state.ui.draft,
      placeholder: "Paste here. Each paste becomes one chain; Stage, P/R IDs, Prompt headings, delimiters and substantial numbered blocks are detected.",
      on: {
        input: (event) => {
          state.ui.draft = event.target.value;
          state.ui.detectedStrategy = Core.parsePromptPack(state.ui.draft, state.ui.splitStrategy).strategy;
          scheduleSave();
          const meter = shadow.getElementById("aisq-detect-meter");
          if (meter) {
            const parsed = Core.parsePromptPack(state.ui.draft, state.ui.splitStrategy);
            meter.textContent = `${parsed.prompts.length} prompt${parsed.prompts.length === 1 ? "" : "s"} · ${parsed.strategy}`;
          }
        },
        paste: (event) => {
          const text = event.clipboardData?.getData("text/plain") || "";
          if (!text.trim()) return;
          event.preventDefault();
          state.ui.draft = text;
          importText(text);
        }
      }
    });
    const strategy = el("select", { className: "aisq-select", value: state.ui.splitStrategy });
    for (const [value, label] of [["auto", "Auto detect"], ["stage", "Stage headings"], ["id", "P001 / R001 IDs"], ["prompt", "Prompt headings"], ["delimiter", "Delimiters"], ["numbered", "Numbered blocks"], ["single", "Single prompt"]]) {
      const option = el("option", { value, text: label });
      if (value === state.ui.splitStrategy) option.selected = true;
      strategy.append(option);
    }
    strategy.addEventListener("change", () => {
      state.ui.splitStrategy = strategy.value;
      state.ui.detectedStrategy = Core.parsePromptPack(state.ui.draft, strategy.value).strategy;
      scheduleSave();
      requestRender();
    });
    const parsed = Core.parsePromptPack(state.ui.draft, state.ui.splitStrategy);
    const meter = el("div", { className: "aisq-meter", text: `${parsed.prompts.length} prompt${parsed.prompts.length === 1 ? "" : "s"} · ${parsed.strategy}` });
    meter.id = "aisq-detect-meter";
    const stack = Core.stackCounts(state);
    const stackMeter = el("div", { className: "aisq-meter", text: `Stack now: ${stack.chains} chain(s) · ${stack.prompts} prompt(s) · ${stack.queued} queued` });
    stackMeter.id = "aisq-stack-meter";
    const add = () => importText(state.ui.draft, state.ui.splitStrategy);
    const addRun = () => {
      const result = importText(state.ui.draft, state.ui.splitStrategy);
      if (result.ok) void startRunner();
    };
    return el("div", { className: "aisq-section" }, [
      el("p", { className: "aisq-copy", text: "Every intentional paste creates one independently editable chain and appends it to the execution stack. Adding a chain never resets a running stack." }),
      field("Split strategy", strategy),
      field("Paste intake", draft),
      meter,
      stackMeter,
      el("div", { className: "aisq-actions" }, [button("Add chain", add, "primary"), button("Add & start", addRun, "ghost")])
    ]);
  }

  function chainCard(chain, index) {
    const selected = chain.id === state.selectedChainId;
    const locked = state.runner.activeChainId === chain.id && state.runner.enabled;
    const counts = Core.chainCounts(chain);
    const status = Core.chainStatus(state, chain);
    const card = el("div", { className: `aisq-chain-card ${selected ? "selected" : ""} ${locked ? "locked" : ""}` });
    const head = el("div", { className: "aisq-chain-head" }, [
      button(`${index + 1}. ${chain.name}`, () => command("SELECT_CHAIN", { chainId: chain.id }), selected ? "primary" : "ghost"),
      el("span", { className: "aisq-status", text: `${status} · ${counts.complete}/${counts.total}` }),
      button("↑", () => command("MOVE_CHAIN", { chainId: chain.id, direction: -1 }), "ghost", `Move ${chain.name} earlier`),
      button("↓", () => command("MOVE_CHAIN", { chainId: chain.id, direction: 1 }), "ghost", `Move ${chain.name} later`),
      button(state.stackOrder.includes(chain.id) ? "–" : "+", () => command(state.stackOrder.includes(chain.id) ? "REMOVE_CHAIN_FROM_STACK" : "ADD_CHAIN_TO_STACK", { chainId: chain.id }), "ghost", state.stackOrder.includes(chain.id) ? `Remove ${chain.name} from stack` : `Add ${chain.name} to stack`)
    ]);
    card.append(head);
    return card;
  }

  function renderPrompts() {
    const chain = selectedChain();
    const wrap = el("div", { className: "aisq-section" });
    const stack = el("div", { className: "aisq-stack-list" });
    if (!state.chains.length) {
      wrap.append(el("p", { className: "aisq-copy", text: "No chains yet. Paste a prompt pack in Build." }));
      return wrap;
    }
    for (const [index, id] of state.stackOrder.entries()) {
      const candidate = Core.getChainById(state, id);
      if (candidate) stack.append(chainCard(candidate, index));
    }
    const stored = state.chains.filter((candidate) => !state.stackOrder.includes(candidate.id));
    if (stored.length) {
      stack.append(el("div", { className: "aisq-help", text: "Stored but removed from stack" }));
      stored.forEach((candidate, index) => stack.append(chainCard(candidate, state.stackOrder.length + index)));
    }
    wrap.append(el("div", { className: "aisq-stack-title" }, [el("strong", { text: "Execution stack" }), el("span", { className: "aisq-copy", text: `${state.stackOrder.length} chain(s)` })]), stack);
    if (!chain) return wrap;

    const select = el("select", { className: "aisq-select" });
    state.chains.forEach((candidate) => {
      const option = el("option", { value: candidate.id, text: `${candidate.name} (${candidate.prompts.length})` });
      option.selected = candidate.id === state.selectedChainId;
      select.append(option);
    });
    select.addEventListener("change", () => command("SELECT_CHAIN", { chainId: select.value }));
    wrap.append(field("Inspect chain", select, runnerPrompt() ? "Inspection is independent from the chain currently running." : ""));

    const name = el("input", { className: "aisq-input", value: chain.name });
    name.addEventListener("change", () => command("RENAME_CHAIN", { chainId: chain.id, name: name.value }));
    wrap.append(field("Chain name", name));
    const counts = Core.chainCounts(chain);
    wrap.append(el("div", { className: "aisq-meter", text: `${counts.complete}/${counts.total} complete · ${counts.queued} queued · ${counts.error} errors · ${counts.skipped} skipped` }));

    const list = el("div", { className: "aisq-prompt-list" });
    chain.prompts.forEach((prompt, index) => {
      const locked = prompt.status === "pending" || prompt.status === "complete" || state.runner.pendingPromptId === prompt.id;
      const editor = el("textarea", { className: "aisq-prompt-editor", value: prompt.text, disabled: locked });
      editor.addEventListener("change", () => command("EDIT_PROMPT", { chainId: chain.id, promptId: prompt.id, text: editor.value }));
      const up = button("↑", () => command("MOVE_PROMPT", { chainId: chain.id, promptId: prompt.id, direction: -1 }), "ghost", `Move ${prompt.label} earlier`);
      const down = button("↓", () => command("MOVE_PROMPT", { chainId: chain.id, promptId: prompt.id, direction: 1 }), "ghost", `Move ${prompt.label} later`);
      const merge = button("Merge", () => command("MERGE_PROMPT", { chainId: chain.id, promptId: prompt.id }), "ghost");
      const remove = button("Delete", () => command("DELETE_PROMPT", { chainId: chain.id, promptId: prompt.id }), "danger ghost");
      [up, down, merge, remove].forEach((control) => { control.disabled = locked || prompt.status === "skipped"; });
      list.append(el("div", { className: `aisq-prompt aisq-${prompt.status}` }, [
        el("div", { className: "aisq-prompt-head" }, [el("span", { className: "aisq-index", text: `${index + 1}` }), el("strong", { text: prompt.label }), el("span", { className: "aisq-status", text: prompt.status }), up, down, merge, remove]),
        editor,
        prompt.error ? el("div", { className: "aisq-error", text: prompt.error }) : null,
        prompt.status === "complete" ? button("Reset from here", () => {
          if (confirm(`Reset ${prompt.label} and all later prompts?`)) command("RESET_FROM_PROMPT", { chainId: chain.id, promptId: prompt.id });
        }, "ghost") : null
      ]));
    });
    const addPromptText = el("input", { className: "aisq-input", placeholder: "New prompt text" });
    const addPrompt = () => { const result = command("ADD_PROMPT", { chainId: chain.id, text: addPromptText.value }); if (result.ok) addPromptText.value = ""; };
    const deleteChain = button("Delete chain", () => {
      if (confirm(`Delete ${chain.name}? This removes its prompts.`)) command("DELETE_CHAIN", { chainId: chain.id }, { history: { kind: "chain_deleted", message: `Deleted ${chain.name}` } });
    }, "danger ghost");
    const duplicate = button("Duplicate chain", () => command("DUPLICATE_CHAIN", { chainId: chain.id }, { history: { kind: "chain_duplicated", message: `Duplicated ${chain.name}` } }), "ghost");
    const skip = button("Skip chain", () => command("SKIP_CHAIN", { chainId: chain.id }, { history: { kind: "chain_skipped", message: `Skipped ${chain.name}` } }), "ghost");
    wrap.append(list, field("Add prompt", addPromptText), el("div", { className: "aisq-actions" }, [button("Add prompt", addPrompt, "primary"), duplicate, skip, button("Reset chain", resetSelectedChain, "ghost"), deleteChain]));
    return wrap;
  }

  function renderRun() {
    const counts = Core.stackCounts(state);
    const host = scanHost();
    const currentChain = runnerChain();
    const current = runnerPrompt();
    const phase = state.runner.phase.replaceAll("_", " ");
    const startLabel = state.runner.phase === PHASES.PAUSED ? "Resume" : "Start";
    const runSelected = button("Run selected", () => void startRunner("selected"), "ghost");
    const foreignPending = !!(state.runner.pendingPromptId && state.runner.ownerTabId && state.runner.ownerTabId !== tabId && !leaseToken);
    const primaryControl = foreignPending
      ? button("Recover here", () => void recoverPendingHere(), "primary", "Explicitly recover the pending runner in this AI Studio app")
      : !state.runner.enabled
        ? button(startLabel, () => { void (state.runner.phase === PHASES.PAUSED ? resumeRunner() : startRunner("stack")); }, "primary")
        : leaseToken ? button("Pause", pauseRunner) : button("Owned elsewhere", () => {}, "ghost", "Runner is owned by another AI Studio tab");
    if (state.runner.enabled && !leaseToken && !foreignPending) primaryControl.disabled = true;
    runSelected.disabled = state.runner.enabled || !!state.runner.pendingPromptId;
    const skipCurrent = button("Skip current", skipPrompt, "ghost");
    skipCurrent.disabled = foreignPending || (state.runner.enabled && !leaseToken);
    return el("div", { className: "aisq-section" }, [
      el("div", { className: "aisq-run-card" }, [el("span", { className: `aisq-phase aisq-phase-${state.runner.phase}`, text: phase }), el("strong", { text: current?.label || currentChain?.name || "No active prompt" }), el("span", { className: "aisq-copy", text: `${counts.complete}/${counts.prompts} complete` })]),
      el("div", { className: "aisq-meter", text: `Stack: ${counts.chains} chain(s) · ${counts.queued} queued · ${counts.pending} pending · ${counts.error} errors` }),
      el("div", { className: "aisq-host-grid" }, [el("span", { text: "Page" }), el("strong", { text: host.mode }), el("span", { text: "AI Studio" }), el("strong", { text: host.lastHeader || host.state }), el("span", { text: "Turns" }), el("strong", { text: `${host.turnCount} (baseline ${state.runner.baselineTurnCount || 0})` }), el("span", { text: "Retries" }), el("strong", { text: `${state.runner.retryCount || 0}/${state.settings.maxRetries}` })]),
      runnerOwnedByOtherTab || foreignPending ? el("div", { className: "aisq-error", text: "Another AI Studio tab owns the pending runner. Recover here only in the same bound app after the original tab closes or its lease expires." }) : null,
      state.runner.lastError ? el("div", { className: "aisq-error", text: state.runner.lastError }) : null,
      exportStep ? el("div", { className: "aisq-meter", text: exportStep }) : null,
      el("div", { className: "aisq-actions" }, [
        primaryControl,
        runSelected,
        skipCurrent,
        button("Download ZIP", () => void downloadZip(), "ghost"),
        button("Diagnostics", downloadDiagnostics, "ghost", "Download redacted Queue Pilot diagnostics")
      ]),
      el("p", { className: "aisq-help", text: "The runner submits one prompt at a time, waits for a newer stable assistant turn, then advances through the editable stack without wrapping." })
    ]);
  }

  function numberSetting(key, label, divisor = 1, min = 0) {
    const input = el("input", { className: "aisq-input", type: "number", value: Number(state.settings[key]) / divisor });
    input.min = String(min);
    input.addEventListener("change", () => mutate(() => { state.settings[key] = Math.max(min, Number(input.value) || 0) * divisor; }));
    return field(label, input);
  }

  function checkboxSetting(key, label, help = "") {
    const input = el("input", { type: "checkbox", checked: state.settings[key], on: { change: () => mutate(() => { state.settings[key] = input.checked; }) } });
    const line = el("label", { className: "aisq-check" }, [input, el("span", { text: label })]);
    if (help) line.append(el("small", { text: help }));
    return line;
  }

  function renderSettings() {
    const failure = el("select", { className: "aisq-select" });
    for (const [value, label] of [["pause", "Pause on failure"], ["skip_prompt", "Skip failed prompt"], ["skip_chain", "Skip failed chain"]]) {
      const option = el("option", { value, text: label });
      option.selected = state.settings.failurePolicy === value;
      failure.append(option);
    }
    failure.addEventListener("change", () => mutate(() => { state.settings.failurePolicy = failure.value; }));
    const placement = el("select", { className: "aisq-select" });
    for (const [value, label] of [["end", "Append new pastes to end"], ["after", "Insert after selected chain"]]) {
      const option = el("option", { value, text: label });
      option.selected = state.settings.pastePlacement === value;
      placement.append(option);
    }
    placement.addEventListener("change", () => mutate(() => { state.settings.pastePlacement = placement.value; }));
    return el("div", { className: "aisq-section" }, [
      checkboxSetting("autoRun", "Continue automatically across the stack", "Turn off for one-at-a-time manual Resume control."),
      checkboxSetting("autoRetry", "Automatically retry AI Studio failures", "Retries only the newest failed turn."),
      checkboxSetting("stopAfterChain", "Pause after the current chain", "Useful for reviewing output before the next paste chain."),
      field("New-paste placement", placement),
      field("Failure policy", failure),
      numberSetting("maxRetries", "Maximum retries"),
      numberSetting("retryDelayMs", "Retry delay (seconds)", 1000),
      numberSetting("settleMs", "Completion settle window (seconds)", 1000, 0.5),
      numberSetting("interPromptDelayMs", "Delay between prompts (seconds)", 1000),
      numberSetting("interChainDelayMs", "Delay between chains (seconds)", 1000),
      numberSetting("startTimeoutMs", "Start timeout (seconds)", 1000, 5),
      numberSetting("completionTimeoutMs", "Completion timeout (minutes)", 60000, 1),
      checkboxSetting("autoAllowAccess", "Click Allow access automatically", "Off by default."),
      checkboxSetting("autoFix", "Click AI Studio Auto-fix automatically", "Off by default because it can modify generated files."),
      checkboxSetting("autoDownloadOnDone", "Download ZIP after the whole stack completes"),
      el("div", { className: "aisq-shortcuts" }, [el("strong", { text: "Shortcuts" }), el("span", { text: "Alt+Shift+A — toggle panel" }), el("span", { text: "Alt+Enter — start/resume stack" })])
    ]);
  }

  function render() {
    if (!panel) return;
    panel.hidden = !state.settings.panelOpen;
    const bubble = shadow.getElementById("aisq-bubble");
    if (bubble) bubble.classList.toggle("running", state.runner.enabled);
    if (statusLine) statusLine.textContent = `${state.runner.phase.replaceAll("_", " ")} · ${state.runner.lastHostState || "ready"}`;
    if (panel.hidden) return;
    const header = el("header", { className: "aisq-header" }, [el("div", {}, [el("strong", { text: "Queue Pilot" }), el("div", { className: "aisq-subtitle", text: "Google AI Studio Apps · stacked chains" })]), button("×", () => mutate(() => { state.settings.panelOpen = false; }), "icon", "Close Queue Pilot")]);
    const tabs = el("nav", { className: "aisq-tabs", role: "tablist", ariaLabel: "Queue Pilot sections" });
    for (const tab of ["build", "prompts", "run", "settings"]) tabs.append(el("button", { className: `aisq-tab ${state.settings.activeTab === tab ? "active" : ""}`, type: "button", text: tab, role: "tab", ariaSelected: state.settings.activeTab === tab, on: { click: () => mutate(() => { state.settings.activeTab = tab; }) } }));
    const body = state.settings.activeTab === "build" ? renderBuild() : state.settings.activeTab === "prompts" ? renderPrompts() : state.settings.activeTab === "run" ? renderRun() : renderSettings();
    const alert = state.runner.lastError && state.settings.activeTab !== "run" ? el("div", { className: "aisq-error aisq-global-error", text: state.runner.lastError, role: "alert" }) : null;
    panel.replaceChildren(header, tabs, alert, body, el("footer", { className: "aisq-footer" }, [el("span", { text: `v${EXTENSION_VERSION} · ` }), statusLine]));
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
      .aisq-tabs { position:sticky; top:61px; z-index:2; display:grid; grid-template-columns:repeat(4,1fr); padding:0 10px 10px; gap:4px; background:#15151af2; }
      .aisq-tab { border:0; border-radius:9px; padding:7px 4px; background:transparent; color:#aaa6b7; text-transform:capitalize; cursor:pointer; }
      .aisq-tab.active { background:#6d4aff; color:white; }
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
      .aisq-chain-card { border:1px solid #ffffff16; border-radius:11px; background:#1d1c22; padding:8px; }
      .aisq-chain-card.selected { border-color:#8067ff; box-shadow:0 0 0 2px #7357ff24; }
      .aisq-chain-card.locked { border-color:#a88cff; }
      .aisq-chain-head { display:grid; grid-template-columns:minmax(0,1fr) auto auto auto auto; gap:5px; align-items:center; }
      .aisq-chain-head .aisq-button:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:left; }
      .aisq-prompt-list { display:flex; flex-direction:column; gap:10px; }
      .aisq-prompt { border-left:3px solid #6b6874; border-radius:10px; background:#1d1c22; padding:10px; }
      .aisq-prompt.aisq-complete { border-left-color:#4ee09a; }
      .aisq-prompt.aisq-pending { border-left-color:#a88cff; }
      .aisq-prompt.aisq-error { border-left-color:#ff6d69; }
      .aisq-prompt.aisq-skipped { border-left-color:#89838f; opacity:.7; }
      .aisq-prompt-head { display:grid; grid-template-columns:26px minmax(0,1fr) auto auto auto auto auto; gap:5px; align-items:center; margin-bottom:8px; }
      .aisq-prompt-head strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .aisq-index { display:grid; place-items:center; width:24px; height:24px; border-radius:7px; background:#302d39; }
      .aisq-status { color:#aaa6b7; font-size:11px; }
      .aisq-error { padding:9px 10px; border:1px solid #ff6d6948; border-radius:9px; background:#5a25273d; color:#ffc0bd; }
      .aisq-global-error { margin:0 16px; }
      .aisq-run-card { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:9px; }
      .aisq-phase { border-radius:999px; padding:4px 8px; background:#34313d; color:#d6d1e2; font-size:11px; text-transform:capitalize; }
      .aisq-phase-running,.aisq-phase-awaiting_start,.aisq-phase-submitting { background:#452f91; color:#e1d8ff; }
      .aisq-phase-done { background:#174a35; color:#a4f5ce; }
      .aisq-host-grid { display:grid; grid-template-columns:auto 1fr; gap:5px 12px; padding:11px; border-radius:10px; background:#1d1c22; }
      .aisq-host-grid span { color:#9995a5; }
      .aisq-host-grid strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .aisq-check { display:grid; grid-template-columns:auto 1fr; gap:5px 9px; align-items:start; padding:9px 0; border-bottom:1px solid #ffffff10; }
      .aisq-check input { margin-top:3px; }
      .aisq-check small { grid-column:2; color:#9995a5; }
      .aisq-shortcuts { display:flex; flex-direction:column; gap:5px; padding:11px; border-radius:10px; background:#1d1c22; }
      .aisq-footer { position:sticky; bottom:0; padding:8px 16px; border-top:1px solid #ffffff12; background:#15151af2; color:#85818f; font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
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
    const bubble = el("button", { type: "button", text: "AISQ", title: "Toggle AI Studio Queue Pilot", ariaLabel: "Toggle AI Studio Queue Pilot", on: { click: () => mutate(() => { state.settings.panelOpen = !state.settings.panelOpen; }) } });
    bubble.id = "aisq-bubble";
    const dlBubble = el("button", { type: "button", text: "⬇︎", title: "Download app (Alt+D)", ariaLabel: "Download app", on: { click: () => void downloadZip() } });
    dlBubble.id = "aisq-dl-bubble";
    panel = el("section");
    panel.id = "aisq-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "AI Studio Queue Pilot");
    statusLine = el("span", { text: "ready" });
    shadow.append(bubble, dlBubble, panel);
    render();
  }

  function handleKeydown(event) {
    if (event.altKey && event.shiftKey && event.code === "KeyA") {
      event.preventDefault();
      mutate(() => { state.settings.panelOpen = !state.settings.panelOpen; });
    } else if (event.altKey && event.key?.toLowerCase() === "d") {
      event.preventDefault();
      void downloadZip();
    } else if (event.altKey && event.key === "Enter" && !rootHost?.contains(event.target)) {
      event.preventDefault();
      void (state.runner.phase === PHASES.PAUSED ? resumeRunner() : startRunner("stack"));
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
    activeCountdown = null;
    textStash = null;
    document.removeEventListener("keydown", handleKeydown, true);
    if (runtimeMessageListener) chrome.runtime.onMessage?.removeListener?.(runtimeMessageListener);
    if (storageChangeListener) chrome.storage.onChanged?.removeListener?.(storageChangeListener);
    releaseRunnerLease();
    rootHost?.remove();
    globalThis.__AISQ_CONTENT_LOADED__ = false;
    if (globalThis.__AISQ_RUNTIME__?.stop === stopRuntime) globalThis.__AISQ_RUNTIME__ = null;
  }

  async function init() {
    try {
      await getTabId();
      const modern = await chrome.storage.local.get(STORAGE_KEY);
      let saved = modern?.[STORAGE_KEY];
      if (!saved) {
        const legacy = await chrome.storage.local.get(LEGACY_STORAGE_KEY);
        saved = legacy?.[LEGACY_STORAGE_KEY];
      }
      state = Core.migrateState(saved);
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
    storageChangeListener = (changes, areaName) => {
      if (areaName !== "local" || !changes?.[STORAGE_KEY]?.newValue) return;
      acceptStoredState(changes[STORAGE_KEY].newValue);
    };
    chrome.storage.onChanged?.addListener(storageChangeListener);
    tickIntervalId = setInterval(() => void tick(), TICK_MS);
    globalThis.__AISQ_RUNTIME__ = Object.freeze({ stop: stopRuntime });
    void tick();
    globalThis.__aisq = Object.freeze({ show: () => mutate(() => { state.settings.panelOpen = true; }), hide: () => mutate(() => { state.settings.panelOpen = false; }), scan: () => scanHost(), state: () => { Core.syncLegacyAliases(state); return clone(state); }, diagnostics: () => clone(createDiagnosticSnapshot()), tick: () => tick(), save: () => saveNow(), importText });
  }

  void init();
})();
