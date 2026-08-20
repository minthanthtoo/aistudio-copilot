(function initAISQCoreCommands(global) {
  "use strict";
  const Core = global.AISQCore;
  const { EVENTS, PHASES, PROMPT_STATUSES, SCHEMA_VERSION } = Core;
  const { nowISO, uid, truncatePayload, getChainById, getSelectedChain, makeChain, normalizeChain, ensureStackOrder, chainIsLocked, promptIsLocked, extractCommonPreface, syncLegacyAliases, nextStackTarget, nextChainTarget, getRunnerChain, getRunnerPrompt, inferStatus, chainCounts } = Core;

  function commitTransition(state, event, payload = {}) {
    if (!EVENTS[event]) throw new Error(`Unknown event: ${event}`);
    
    // Apply state updates from payload
    if (payload.phase && state.runner) {
      state.runner.phase = payload.phase;
    }
    if (payload.error !== undefined && state.runner) {
      state.runner.lastError = payload.error;
    }

    const entry = {
      event,
      payload: truncatePayload(payload),
      at: nowISO(),
      rev: (state.revision || 0) + 1,
    };
    if (!state.eventLog) state.eventLog = [];
    state.eventLog.push(entry);
    if (state.eventLog.length > 500) state.eventLog = state.eventLog.slice(-400);
    state.revision = entry.rev;
    state.updatedAt = nowISO();
    if (state.runner) {
      state.runner.revision = (state.runner.revision || 0) + 1;
      state.runner.updatedAt = state.updatedAt;
    }
    return entry;
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

    } else if (type === "IMPORT_CHAIN_FROM_PROJECT") {
      const sourceProject = state.projects[payload.sourceProjectKey];
      const sourceChain = sourceProject?.chains?.find(c => c.id === payload.chainId);
      if (!sourceChain) return reject("Source chain not found");
      
      const copy = makeChain(
        sourceChain.name,
        sourceChain.prompts.map(p => ({
          ...p, id: uid("prompt"), status: "queued",
          attempts: 0, submittedAt: null, completedAt: null, error: null
        })),
        sourceChain.source.raw,
        { ...sourceChain.source, preface: sourceChain.preface }
      );
      state.chains.push(copy);
      ensureStackOrder(state);
      state.selectedChainId = copy.id;
      state.ui.lastImportId = copy.id;
      result.value = copy;
    } else if (type === "SELECT_CHAIN") {
      if (!getChainById(state, payload.chainId)) return reject("Chain not found");
      state.selectedChainId = payload.chainId;
    } else if (type === "RENAME_CHAIN") {
      if (!chain) return reject("Chain not found");
      chain.name = normalizeText(payload.name) || "Prompt chain";
      chain.updatedAt = nowISO();
    } else if (type === "EDIT_PREFACE") {
      if (!chain) return reject("Chain not found");
      chain.preface = normalizeText(payload.text);
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
      if (chain.id === state.runner.activeChainId) {
        const index = state.stackOrder.indexOf(chain.id);
        state.runner.activeChainId = state.stackOrder[index + 1] || null;
      }
      state.stackOrder = state.stackOrder.filter((id) => id !== chain.id);
    } else if (type === "ADD_CHAIN_TO_STACK") {
      if (!chain) return reject("Chain not found");
      if (!state.stackOrder.includes(chain.id)) state.stackOrder.push(chain.id);
    } else if (type === "JUMP_TO_CHAIN") {
      if (!chain) return reject("Chain not found");
      if (chainIsLocked(state, chain.id) || (state.runner.enabled && chain.id === state.runner.activeChainId)) return reject("The running chain is locked");
      state.stackOrder = state.stackOrder.filter((id) => id !== chain.id);
      const activeIndex = state.runner.activeChainId ? state.stackOrder.indexOf(state.runner.activeChainId) : -1;
      state.stackOrder.splice(activeIndex + 1, 0, chain.id);
      state.selectedChainId = chain.id;
    } else if (type === "FORCE_JUMP_TO_CHAIN") {
      if (!chain) return reject("Chain not found");
      if (state.runner.enabled && state.runner.activeChainId !== chain.id) return reject("Pause runner to jump across chains");
      const targetIndex = state.stackOrder.indexOf(chain.id);
      if (targetIndex < 0) return reject("Chain is not in the stack");
      for (let i = 0; i < targetIndex; i++) {
        const c = getChainById(state, state.stackOrder[i]);
        if (c) c.prompts.forEach((p) => { if (p.status === "queued" || p.status === "error") p.status = "skipped"; });
      }
      state.runner.activeChainId = chain.id;
      state.runner.pendingPromptId = null;
      state.selectedChainId = chain.id;
      chain.updatedAt = nowISO();
    } else if (type === "MOVE_CHAIN_TO_BOTTOM") {
      if (!chain) return reject("Chain not found");
      if (state.runner.enabled && chain.id === state.runner.activeChainId) return reject("The running chain is locked");
      state.stackOrder = state.stackOrder.filter((id) => id !== chain.id);
      state.stackOrder.push(chain.id);
    } else if (type === "DELETE_CHAIN") {
      if (!chain) return reject("Chain not found");
      if (chainIsLocked(state, chain.id) || (state.runner.enabled && chain.id === state.runner.activeChainId)) return reject("Pause before deleting the active chain");
      if (chain.id === state.runner.activeChainId) {
        const index = state.stackOrder.indexOf(chain.id);
        state.runner.activeChainId = state.stackOrder[index + 1] || null;
      }
      state.chains = state.chains.filter((item) => item.id !== chain.id);
      state.stackOrder = state.stackOrder.filter((id) => id !== chain.id);
      if (state.selectedChainId === chain.id) state.selectedChainId = state.stackOrder[0] || state.chains[0]?.id || null;
    } else if (type === "DUPLICATE_CHAIN") {
      if (!chain) return reject("Chain not found");
      const copy = makeChain(`${chain.name} copy`, chain.prompts.map((prompt) => ({ ...prompt, id: uid("prompt"), status: "queued", attempts: 0, submittedAt: null, completedAt: null, error: null })), chain.source.raw, { ...chain.source, preface: chain.preface });
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
    } else if (type === "REORDER_TO_NEXT") {
      const prompt = chain?.prompts.find((item) => item.id === payload.promptId);
      if (!chain || !prompt) return reject("Target not found");
      if (prompt.status !== "queued" && prompt.status !== "error") return reject("Can only reorder pending prompts");
      let insertIndex = 0;
      for (let i = 0; i < chain.prompts.length; i++) {
        if (chain.prompts[i].status === "queued" || chain.prompts[i].status === "error") {
          insertIndex = i;
          break;
        }
      }
      const currentIndex = chain.prompts.indexOf(prompt);
      if (currentIndex === insertIndex) return;
      chain.prompts.splice(currentIndex, 1);
      const safeIndex = currentIndex < insertIndex ? insertIndex - 1 : insertIndex;
      chain.prompts.splice(safeIndex, 0, prompt);
      chain.updatedAt = nowISO();
    } else if (type === "JUMP_TO_PROMPT") {
      const prompt = chain?.prompts.find((item) => item.id === payload.promptId);
      if (!chain || !prompt) return reject("Target not found");
      if (state.runner.enabled && state.runner.activeChainId !== chain.id) return reject("Pause runner to jump across chains");
      const currentIndex = chain.prompts.indexOf(prompt);
      for (let i = 0; i < currentIndex; i++) {
        const p = chain.prompts[i];
        if (p.status === "queued" || p.status === "error" || p.status === "pending") p.status = "skipped";
      }
      prompt.status = "queued";
      prompt.error = null;
      prompt.attempts = 0;
      prompt.submittedAt = null;
      prompt.completedAt = null;
      for (let i = currentIndex + 1; i < chain.prompts.length; i++) {
        const p = chain.prompts[i];
        if (p.status === "skipped") p.status = "queued";
      }
      state.runner.activeChainId = chain.id;
      state.runner.pendingPromptId = null;
      if (state.runner.enabled) {
        state.runner.phase = PHASES.READY;
      }
      chain.updatedAt = nowISO();
    } else if (type === "EXTRACT_CHAIN_PREFACE") {
      if (!chain) return reject("Chain not found");
      const stagePattern = /^[ \t]{0,3}(?:#{1,6}\s*)?(?:(?:Stage|Phase|Step|Round|Part)\s+\d+|(?:\[)?(?:P|R)\d{3}(?:\])?|Prompt\s+\d+)\b/im;
      const texts = chain.prompts.map((p) => p.text);
      let extracted = extractCommonPreface(chain.preface, texts);

      if (!extracted.preface && chain.prompts.length > 1) {
        const p1 = chain.prompts[0];
        const p2 = chain.prompts[1];
        
        // Case 1: Prompt 1 has no stage header, but subsequent prompts have stage headers
        if (!stagePattern.test(p1.text) && stagePattern.test(p2.text)) {
          chain.preface = p1.text.trim();
          chain.prompts.shift();
          chain.prompts.forEach((p, idx) => {
            p.label = labelForPrompt(p.text, idx);
            p.includePreface = true;
          });
          chain.updatedAt = nowISO();
          return;
        }

        // Case 2: Prompt 1 has leading conversational preamble before its stage header
        const match = p1.text.match(stagePattern);
        if (match && match.index > 15) {
          const intro = p1.text.slice(0, match.index).trim();
          const rest = p1.text.slice(match.index).trim();
          if (intro.length >= 15 && rest.length >= 15) {
            chain.preface = intro;
            p1.text = rest;
            p1.label = labelForPrompt(p1.text, 0);
            p1.includePreface = true;
            chain.prompts.forEach((p) => { p.includePreface = true; });
            chain.updatedAt = nowISO();
            return;
          }
        }
      }

      if (extracted.preface && extracted.preface !== chain.preface) {
        chain.preface = extracted.preface;
        chain.prompts.forEach((p, idx) => {
          p.text = extracted.parts[idx] || p.text;
          p.label = labelForPrompt(p.text, idx);
          p.includePreface = true;
        });
        chain.updatedAt = nowISO();
      }
    } else if (type === "MOVE_PARAGRAPH_TO_PREFACE") {
      if (!chain) return reject("Chain not found");
      const prompt = chain.prompts.find((p) => p.id === payload.promptId);
      if (!prompt) return reject("Prompt not found");
      const paras = prompt.text.split(/\n\s*\n/);
      if (paras.length < 2) return reject("Prompt only has one paragraph");
      const firstPara = paras.shift().trim();
      prompt.text = paras.join("\n\n").trim();
      prompt.label = labelForPrompt(prompt.text, chain.prompts.indexOf(prompt));
      chain.preface = chain.preface ? `${chain.preface}\n\n${firstPara}`.trim() : firstPara;
      chain.prompts.forEach((p) => { p.includePreface = true; });
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
    if ([PHASES.AWAITING, PHASES.RUNNING, PHASES.SETTLING, PHASES.RETRY_WAIT].includes(phase) && elapsed > Number(settings.completionTimeoutMs)) {
      return { action: "timeout", message: phase === PHASES.RETRY_WAIT ? "Retry did not restart" : "AI Studio prompt exceeded the completion timeout", host };
    }
    if (phase === PHASES.RETRY_WAIT) {
      if ((newTurn || runner.sawBusy) && host.busy) return { action: "mark_running", phase: PHASES.RUNNING, host };
      if (now >= Number(runner.nextActionAt || 0) && host.retryVisible) return { action: "retry_now", host };
      return { action: "none", host };
    }
    if (host.busy) {
      if (phase !== PHASES.RUNNING) return { action: "mark_running", phase: PHASES.RUNNING, host };
      return { action: "none", host };
    }
    if (newTurn && host.failed) {
      const maxRetries = Number(settings.maxRetries || 0);
      const isUnlimited = maxRetries === 0;
      if (settings.autoRetry && (isUnlimited || Number(runner.retryCount || 0) < maxRetries)) return { action: "schedule_retry", phase: PHASES.RETRY_WAIT, host };
      return { action: "pause_for_failure", phase: PHASES.PAUSED, message: host.errorText || "AI Studio run failed", host };
    }
    if (newTurn && host.success) {
      if (phase !== PHASES.SETTLING) return { action: "begin_settle", phase: PHASES.SETTLING, host };
      if (now >= Number(runner.settleUntil || 0)) return { action: "complete_prompt", host };
    }
    if (phase === PHASES.SETTLING && host.busy) return { action: "mark_running", phase: PHASES.RUNNING, host };
    if ([PHASES.AWAITING, PHASES.SUBMITTING].includes(phase) && !host.busy && elapsed > Number(settings.startTimeoutMs)) {
      return { action: "timeout", message: "AI Studio did not start the submitted prompt", host };
    }
    return { action: "none", host };
  }


  Object.assign(Core, { commitTransition, reject, applyCommand, classifyHostSnapshot, decideRunnerTransition });
  
  if (typeof module !== "undefined" && module.exports) module.exports = Core;
})(typeof globalThis !== "undefined" ? globalThis : this);
