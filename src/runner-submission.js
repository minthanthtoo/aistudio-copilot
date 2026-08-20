(function initAISQRunnerSubmission(global) {
  "use strict";
  const Core = global.AISQCore;
  const ctx = global.AISQContext;
  const PHASES = Core.PHASES;

  function nextTarget() {
    const options = { selectedOnly: ctx.state.runner.scope === "selected" };
    if (ctx.state.runner.scope === "selected") options.startChainId = ctx.state.runner.scopeChainId || ctx.state.runner.activeChainId || ctx.state.selectedChainId;
    return Core.nextStackTarget(ctx.state, options);
  }

  function markPromptError(message) {
    const prompt = ctx.runnerPrompt();
    if (prompt) {
      prompt.status = "error";
      prompt.error = message;
    }
    Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.PAUSED });
    ctx.state.runner.enabled = false;
    ctx.state.runner.lastError = message;
    ctx.state.runner.nextTarget = null;
    ctx.state.runner.ownerTabId = null;
    ctx.state.runner.leaseUpdatedAt = null;
    releaseRunnerLease();
    ctx.addHistory("error", message, { promptId: prompt?.id || null });
    ctx.touchState();
  }

  function finishRun(message = "Stack completed") {
    Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.DONE });
    ctx.state.runner.enabled = false;
    ctx.state.runner.pendingPromptId = null;
    ctx.state.runner.nextTarget = null;
    ctx.state.runner.scopeChainId = null;
    ctx.state.runner.boundPageKey = null;
    ctx.state.runner.ownerTabId = null;
    ctx.state.runner.leaseUpdatedAt = null;
    releaseRunnerLease();
    ctx.addHistory("stack_done", message);
    if (ctx.state.settings.autoDownloadOnDone) void ctx.downloadZip();
  }

  function getPromptFullText(chain, prompt) {
    if (!prompt) return "";
    const pText = chain?.preface ? String(chain.preface).trim() : "";
    if (prompt.includePreface !== false && pText) {
      return `${pText}\n\n${prompt.text}`;
    }
    return prompt.text;
  }

  function beginSubmission(host) {
    const target = nextTarget();
    if (!target) {
      finishRun();
      return;
    }
    const { chain, prompt } = target;
    if (host.mode === "unsupported") {
      ctx.state.runner.lastHostState = "Open AI Studio Apps start or editor page";
      return;
    }
    if (host.blocked) {
      ctx.state.runner.lastHostState = `Blocked: ${host.blockedReason}`;
      return;
    }
    if (host.busy) {
      ctx.state.runner.lastHostState = "Waiting for the current AI Studio run to finish";
      return;
    }
    ctx.state.runner.activeChainId = chain.id;
    ctx.state.runner.pendingPromptId = prompt.id;
    ctx.state.runner.boundPageKey = ctx.currentPageKey();
    prompt.status = "pending";
    prompt.attempts = Number(prompt.attempts || 0) + 1;
    prompt.submittedAt = Core.nowISO();
    prompt.error = null;
    Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.SUBMITTING });
    ctx.state.runner.baselineTurnCount = host.turnCount;
    ctx.state.runner.submittedAt = Date.now();
    ctx.state.runner.clickedAt = null;
    ctx.state.runner.sawBusy = false;
    ctx.state.runner.settleUntil = null;
    ctx.state.runner.retryCount = 0;
    ctx.state.runner.lastError = null;
    ctx.addHistory("prepared", `Prepared ${prompt.label}`, { chainId: chain.id, promptId: prompt.id, mode: host.mode });
    
    const fullText = getPromptFullText(chain, prompt);
    try {
      ctx.setNativeValue(host.textarea, fullText);
      ctx.state.runner.nextActionAt = Date.now() + 150;
      ctx.touchState();
      ctx.scheduleSave();
    } catch (error) {
      prompt.status = "error";
      markPromptError(`Could not fill AI Studio composer: ${error.message}`);
      ctx.scheduleSave();
    }
  }

  async function finishSubmission(host) {
    const prompt = ctx.runnerPrompt();
    if (!prompt) return markPromptError("Pending prompt could not be found");
    const chain = (ctx.state.chains || []).find((c) => c.id === ctx.state.runner.activeChainId);
    const fullText = getPromptFullText(chain, prompt);
    if (!host.textarea || (!host.submit && host.mode === "editor")) {
      if (Date.now() - Number(ctx.state.runner.submittedAt || 0) > ctx.state.settings.startTimeoutMs) markPromptError("AI Studio composer disappeared before submission");
      return;
    }
    if (host.textarea.value !== fullText) {
      ctx.setNativeValue(host.textarea, fullText);
      ctx.state.runner.nextActionAt = Date.now() + 150;
      return;
    }
    if (Date.now() < Number(ctx.state.runner.nextActionAt || 0)) return;
    
    // Give submitReady up to 500ms before proceeding
    const elapsedSinceSubmit = Date.now() - Number(ctx.state.runner.submittedAt || 0);
    if (!host.submitReady && elapsedSinceSubmit < 500) return;

    const intendedPromptId = prompt.id;
    ctx.state.runner.clickedAt = Date.now();
    ctx.state.runner.submittedAt = Date.now();
    Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.AWAITING });
    ctx.state.runner.lastHostState = "Submission committed; waiting for a new assistant turn";
    ctx.addHistory("submission_committed", `Committed ${prompt.label} before host click`, { chainId: ctx.state.runner.activeChainId, promptId: prompt.id, mode: host.mode });
    ctx.touchState();
    const persisted = await ctx.saveNow();
    if (!persisted || ctx.state.runner.pendingPromptId !== intendedPromptId || !ctx.state.runner.enabled) return;
    
    if (host.submit) {
      const isStop = Array.from(host.submit.querySelectorAll('mat-icon, .material-icons, .material-symbols-outlined')).some(el => /^(stop|stop_circle|cancel|pause|pause_circle)$/i.test(ctx.state.ui?.draft ? "" : (el.textContent || "")));
      if (!isStop && !/^(stop|cancel|pause)/i.test(host.submit.textContent?.trim() || "")) {
        host.submit.click();
      }
    } else if (host.textarea) {
      const enterKey = (type) => new KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13
      });
      host.textarea.dispatchEvent(enterKey("keydown"));
      host.textarea.dispatchEvent(enterKey("keyup"));
    }
    
    ctx.addHistory("submitted", `Submitted ${prompt.label}`, { chainId: ctx.state.runner.activeChainId, promptId: prompt.id, mode: host.mode });
    ctx.touchState();
    ctx.scheduleSave();
  }


  Object.assign(ctx, { nextTarget, markPromptError, finishRun, getPromptFullText, beginSubmission, finishSubmission });
})(typeof globalThis !== "undefined" ? globalThis : this);
