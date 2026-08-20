(function initAISQRunner(global) {
  "use strict";
try {
  const Core = global.AISQCore;
  const ctx = global.AISQContext;
  const PHASES = Core.PHASES;
  
  function leaseExpired() {
    const stamp = Date.parse(ctx.state.runner.leaseUpdatedAt || "") || 0;
    return !ctx.state.runner.ownerTabId || ctx.state.runner.ownerTabId === ctx.tabId || Date.now() - stamp > 1500;
  }

  function canRun() {
    return !ctx.runnerOwnedByOtherTab && (ctx.leaseToken || leaseExpired() || ctx.state.runner.ownerTabId === ctx.tabId);
  }

  function claimLocalLease() {
    if (!canRun()) {
      ctx.runnerOwnedByOtherTab = true;
      return false;
    }
    ctx.state.runner.ownerTabId = ctx.tabId;
    ctx.state.runner.leaseUpdatedAt = Core.nowISO();
    ctx.runnerOwnedByOtherTab = false;
    return true;
  }

  function sendRuntimeMessage(message, timeoutMs = 5000) {
    if (!chrome.runtime?.sendMessage) return Promise.resolve(null);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(value || null);
      };
      const timeout = setTimeout(() => finish({ ok: false, error: "timeout" }), timeoutMs);
      try {
        const promise = chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            finish({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          finish(response);
        });
        if (promise && typeof promise.then === "function") promise.then(finish, (err) => finish({ ok: false, error: err.message }));
      } catch (err) {
        finish({ ok: false, error: err.message });
      }
    });
  }

  async function acquireRunnerLease() {
    if (!chrome.runtime?.sendMessage) {
      const acquired = claimLocalLease();
      if (acquired) ctx.leaseToken = `local-${ctx.tabId}`;
      return acquired;
    }
    const response = await sendRuntimeMessage({ type: "AISQ_LEASE_ACQUIRE", key: ctx.currentPageKey(), leaseMs: 20000 });
    if (!response?.ok) {
      if (response && response.error && (response.error.includes("Extension context invalidated") || response.error.includes("message port closed"))) {
        ctx.state.runner.lastError = "Extension was reloaded. Please refresh this page to continue.";
        ctx.state.runner.enabled = false;
        Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.PAUSED });
        ctx.requestRender();
      }
      ctx.runnerOwnedByOtherTab = true;
      ctx.state.runner.ownerTabId = response?.ownerTabId !== undefined && response?.ownerTabId !== null ? String(response.ownerTabId) : ctx.state.runner.ownerTabId;
      return false;
    }
    ctx.leaseToken = response.token;
    ctx.lastLeaseHeartbeatAt = Date.now();
    ctx.state.runner.ownerTabId = ctx.tabId;
    ctx.state.runner.leaseUpdatedAt = Core.nowISO();
    ctx.runnerOwnedByOtherTab = false;
    return true;
  }

  async function heartbeatRunnerLease() {
    if (!chrome.runtime?.sendMessage) {
      ctx.state.runner.leaseUpdatedAt = Core.nowISO();
      return true;
    }
    if (!ctx.leaseToken) return acquireRunnerLease();
    if (Date.now() - ctx.lastLeaseHeartbeatAt < 5000) return true;
    const response = await sendRuntimeMessage({ type: "AISQ_LEASE_HEARTBEAT", token: ctx.leaseToken, key: ctx.currentPageKey(), leaseMs: 20000 });
    if (!response?.ok) {
      ctx.leaseToken = null;
      ctx.runnerOwnedByOtherTab = true;
      ctx.state.runner.enabled = false;
      Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.PAUSED });
      ctx.state.runner.ownerTabId = response?.ownerTabId !== undefined && response?.ownerTabId !== null ? String(response.ownerTabId) : null;
      ctx.state.runner.leaseUpdatedAt = null;
      
      if (response && response.error && (response.error.includes("Extension context invalidated") || response.error.includes("message port closed"))) {
        ctx.state.runner.lastError = "Extension was reloaded. Please refresh this page to continue.";
      } else {
        ctx.state.runner.lastError = `Runner lease was lost to another AI Studio tab; execution paused before the next action. (Debug: ${JSON.stringify(response)})`;
      }
      
      ctx.addHistory("lease_lost", ctx.state.runner.lastError);
      ctx.touchState();
      ctx.scheduleSave();
      ctx.requestRender();
      return false;
    }
    ctx.lastLeaseHeartbeatAt = Date.now();
    ctx.state.runner.leaseUpdatedAt = Core.nowISO();
    return true;
  }

  function releaseRunnerLease() {
    const token = ctx.leaseToken;
    ctx.leaseToken = null;
    ctx.lastLeaseHeartbeatAt = 0;
    ctx.runnerOwnedByOtherTab = false;
    if (chrome.runtime?.sendMessage && token) void sendRuntimeMessage({ type: "AISQ_LEASE_RELEASE", token, key: ctx.currentPageKey() }, 800);
  }

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
    const chain = ctx.state.chains.find((c) => c.id === ctx.state.runner.activeChainId);
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
      host.submit.click();
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

  async function applyTransition(decision, host) {
    const prompt = ctx.runnerPrompt();
    const chain = ctx.runnerChain();
    switch (decision.action) {
      case "mark_running":
        Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.RUNNING });
        ctx.state.runner.sawBusy = true;
        ctx.state.runner.lastHostState = host.lastHeader || "AI Studio is running";
        break;
      case "begin_settle":
        Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.SETTLING });
        ctx.state.runner.settleUntil = Date.now() + ctx.state.settings.settleMs;
        ctx.state.runner.lastHostState = host.lastHeader || "Completed; verifying stable ctx.state";
        break;
      case "complete_prompt": {
        if (!prompt || !chain) return markPromptError("Completion arrived without a pending prompt");
        prompt.status = "complete";
        prompt.completedAt = Core.nowISO();
        prompt.error = null;
        chain.updatedAt = Core.nowISO();
        ctx.addHistory("completed", `Completed ${prompt.label}`, { chainId: chain.id, promptId: prompt.id, header: host.lastHeader });
        ctx.state.runner.pendingPromptId = null;
        ctx.state.runner.retryCount = 0;
        const target = nextTarget();
        ctx.state.runner.nextTarget = target ? { chainId: target.chain.id, promptId: target.prompt.id } : null;
        const sameChain = target && target.chain.id === chain.id;
        if (!target) {
          finishRun();
        } else if (ctx.state.settings.stopAfterChain && !sameChain) {
          Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.PAUSED });
          ctx.state.runner.enabled = false;
          ctx.state.runner.lastHostState = "Chain complete; stopped before the next chain";
          ctx.state.runner.ownerTabId = null;
          releaseRunnerLease();
          ctx.addHistory("chain_pause", `Stopped after ${chain.name}`);
        } else if (ctx.state.settings.autoRun) {
          Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.PACING });
          ctx.state.runner.nextActionAt = Date.now() + (sameChain ? ctx.state.settings.interPromptDelayMs : ctx.state.settings.interChainDelayMs);
        } else {
          Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.PAUSED });
          ctx.state.runner.enabled = false;
          ctx.state.runner.nextActionAt = null;
          ctx.state.runner.lastHostState = "Prompt complete; manual Resume is enabled";
          ctx.state.runner.ownerTabId = null;
          releaseRunnerLease();
        }
        break;
      }
      case "schedule_retry":
        Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.RETRY_WAIT });
        ctx.state.runner.retryCount = Number(ctx.state.runner.retryCount || 0) + 1;
        ctx.state.runner.nextActionAt = Date.now() + ctx.state.settings.retryDelayMs;
        ctx.state.runner.lastError = host.errorText || host.lastHeader || "AI Studio failed";
        const retryMaxLabel = Number(ctx.state.settings.maxRetries || 0) === 0 ? "∞" : ctx.state.settings.maxRetries;
        ctx.addHistory("retry_scheduled", `Retry ${ctx.state.runner.retryCount}/${retryMaxLabel} scheduled`, { promptId: prompt?.id || null });
        break;
      case "retry_now":
        if (!host.retry || !ctx.visible(host.retry)) return markPromptError("Retry control disappeared");
        ctx.state.runner.baselineTurnCount = host.turnCount;
        ctx.state.runner.submittedAt = Date.now();
        ctx.state.runner.sawBusy = false;
        Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.AWAITING });
        if (prompt) prompt.attempts = Number(prompt.attempts || 0) + 1;
        ctx.touchState();
        if (!await ctx.saveNow() || ctx.state.runner.pendingPromptId !== prompt?.id || !ctx.state.runner.enabled) break;
        console.log("CLICKING RETRY:", host.retry?.id); ctx.robustClick(host.retry);
        const retryMaxClickLabel = Number(ctx.state.settings.maxRetries || 0) === 0 ? "∞" : ctx.state.settings.maxRetries;
        ctx.addHistory("retry_clicked", `Clicked Retry ${ctx.state.runner.retryCount}/${retryMaxClickLabel}`, { promptId: prompt?.id || null });
        break;
      case "pause_for_failure": {
        const policy = ctx.state.settings.failurePolicy || "pause";
        if (policy === "skip_prompt" && prompt) {
          prompt.status = "skipped";
          prompt.error = decision.message || host.errorText || "Skipped after failure";
          ctx.state.runner.pendingPromptId = null;
          const target = nextTarget();
          ctx.state.runner.nextTarget = target ? { chainId: target.chain.id, promptId: target.prompt.id } : null;
          if (!target) finishRun("Stack completed after skipping a failed prompt");
          else if (ctx.state.settings.autoRun) {
            Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.PACING });
            ctx.state.runner.nextActionAt = Date.now() + ctx.state.settings.interPromptDelayMs;
          } else {
            ctx.state.runner.enabled = false;
            Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.PAUSED });
            ctx.state.runner.ownerTabId = null;
            releaseRunnerLease();
          }
          ctx.addHistory("failure_skipped", `Skipped failed prompt ${prompt.label}`);
        } else if (policy === "skip_chain" && chain) {
          for (const item of chain.prompts) if (["queued", "error", "pending"].includes(item.status)) item.status = "skipped";
          ctx.state.runner.pendingPromptId = null;
          const target = nextTarget();
          ctx.state.runner.nextTarget = target ? { chainId: target.chain.id, promptId: target.prompt.id } : null;
          if (!target) finishRun("Stack completed after skipping a failed chain");
          else if (ctx.state.settings.autoRun) {
            Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.PACING });
            ctx.state.runner.nextActionAt = Date.now() + ctx.state.settings.interChainDelayMs;
          } else {
            ctx.state.runner.enabled = false;
            Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.PAUSED });
            ctx.state.runner.ownerTabId = null;
            releaseRunnerLease();
          }
          ctx.addHistory("failure_chain_skipped", `Skipped failed chain ${chain.name}`);
        } else {
          markPromptError(decision.message || "AI Studio run failed");
        }
        break;
      }
      case "timeout":
        markPromptError(decision.message || "AI Studio run failed");
        break;
      case "pacing_complete":
        Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: ctx.state.settings.autoRun ? PHASES.READY : PHASES.PAUSED });
        ctx.state.runner.enabled = !!ctx.state.settings.autoRun;
        ctx.state.runner.nextActionAt = null;
        break;
      default:
        break;
    }
    if (decision.action !== "none") ctx.touchState();
  }

  function clickOptInControls() {
    let changed = false;

    // Auto-allow
    if (ctx.state.settings.autoAllowAccess && (!ctx.activeCountdown || ctx.activeCountdown.type === "allow")) {
      const allow = ctx.visibleAll("button").find((button) => /^Allow access$/i.test(ctx.textOf(button)));
      if (allow && enabled(allow) && !ctx.clickedOptInControls.has(allow)) {
        if (!ctx.activeCountdown) {
          ctx.activeCountdown = { type: "allow", button: allow, expires: Date.now() + 3000 };
          ctx.requestRender();
        } else if (Date.now() >= ctx.activeCountdown.expires) {
          ctx.clickedOptInControls.add(allow);
          allow.click();
          ctx.addHistory("host_action", "Clicked Allow access");
          ctx.activeCountdown = null;
          changed = true;
          ctx.requestRender();
        }
      } else if (ctx.activeCountdown?.type === "allow") {
        ctx.activeCountdown = null;
        ctx.requestRender();
      }
    }

    // Auto-fix
    if (ctx.state.settings.autoFix && (!ctx.activeCountdown || ctx.activeCountdown.type === "autofix")) {
      const fix = ctx.visibleAll("button").find((button) => /^(Auto-fix|Autofix|Auto fix|Fix error)$/i.test(ctx.textOf(button)));
      if (fix && enabled(fix) && !ctx.clickedOptInControls.has(fix)) {
        if (!ctx.activeCountdown) {
          stashText();
          ctx.activeCountdown = { type: "autofix", button: fix, expires: Date.now() + 3000 };
          ctx.requestRender();
        } else if (Date.now() >= ctx.activeCountdown.expires) {
          ctx.clickedOptInControls.add(fix);
          ctx.robustClick(fix);
          ctx.addHistory("host_action", `Clicked ${ctx.textOf(fix)}`);
          ctx.activeCountdown = null;
          setTimeout(restoreText, 2600);
          changed = true;
          ctx.requestRender();
        }
      } else if (ctx.activeCountdown?.type === "autofix") {
        restoreText();
        ctx.activeCountdown = null;
        ctx.requestRender();
      }
    }

    return changed;
  }

  let countdownBadge = null;
  function renderCountdowns() {
    let text = null;
    let targetBtn = null;
    let msLeft = 0;
    if (ctx.activeCountdown && ctx.activeCountdown.button) {
      msLeft = ctx.activeCountdown.expires - Date.now();
      targetBtn = ctx.activeCountdown.button;
      text = ctx.activeCountdown.type === "autofix" ? "Auto-fix" : "Allow";
    } else if (ctx.state.runner.phase === PHASES.RETRY_WAIT && ctx.state.runner.nextActionAt) {
      msLeft = ctx.state.runner.nextActionAt - Date.now();
      const host = ctx.scanHost();
      targetBtn = host.retry;
      text = "Retry";
    }
    if (!targetBtn || msLeft < 0) {
      if (countdownBadge) { countdownBadge.remove(); countdownBadge = null; }
      return;
    }
    if (!countdownBadge) {
      countdownBadge = ctx.el("div", { className: "aisq-badge" });
      ctx.shadow.append(countdownBadge);
    }
    countdownBadge.textContent = `${text} in ${(msLeft / 1000).toFixed(1)}s`;
    const r = targetBtn.getBoundingClientRect();
    countdownBadge.style.top = `${Math.max(8, r.top - 34)}px`;
    countdownBadge.style.left = `${Math.min(window.innerWidth - 8, r.right) - 10}px`;
    countdownBadge.style.transform = "translateX(-100%)";
  }

  async function tick() {
    if (ctx.tickBusy) return;
    ctx.tickBusy = true;
    try {
      if (ctx.state.uiIntent) {
        const intent = ctx.state.uiIntent;
        ctx.mutate(() => { ctx.state.uiIntent = null; });
        if (intent.action === 'start') await startRunner(intent.scope);
        else if (intent.action === 'resume') await resumeRunner();
        else if (intent.action === 'pause') pauseRunner();
        else if (intent.action === 'recover') await recoverPendingHere();
        else if (intent.action === 'skip') skipPrompt();
        ctx.requestRender();
      }

      const host = ctx.scanHost();
      const signature = [host.mode, host.submitReady, host.turnCount, host.lastHeader, host.retryVisible, host.blocked].join("|");
      if (signature !== ctx.lastHostSignature) {
        ctx.lastHostSignature = signature;
        ctx.state.runner.lastHostState = host.blocked ? `Blocked: ${host.blockedReason}` : `${host.mode}: ${host.state}`;
        ctx.requestRender();
      }
      if (clickOptInControls()) ctx.requestRender();
      renderCountdowns();
      if (ctx.state.runner.pendingPromptId && ctx.leaseToken && ctx.state.runner.ownerTabId === ctx.tabId) {
        const currentKey = ctx.currentPageKey();
        if (ctx.isAppsListUpgrade(ctx.state.runner.boundPageKey, currentKey)) {
          ctx.state.runner.boundPageKey = currentKey;
          ctx.touchState();
          ctx.scheduleSave();
        } else if (!ctx.pageMatchesBinding()) {
          ctx.state.runner.enabled = false;
          Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.PAUSED });
          ctx.state.runner.ownerTabId = null;
          ctx.state.runner.leaseUpdatedAt = null;
          ctx.state.runner.lastError = `Pending work is bound to ${ctx.state.runner.boundPageKey}; open that AI Studio app before resuming`;
          releaseRunnerLease();
          ctx.touchState();
          ctx.scheduleSave();
          ctx.requestRender();
          return;
        }
      }
      if (!ctx.state.runner.enabled) {
        if (ctx.state.runner.pendingPromptId && ctx.leaseToken) await heartbeatRunnerLease();
        return;
      }
      if (!ctx.leaseToken) {
        if (ctx.state.runner.pendingPromptId && ctx.state.runner.ownerTabId && ctx.state.runner.ownerTabId !== ctx.tabId) {
          ctx.runnerOwnedByOtherTab = true;
          ctx.state.runner.lastHostState = "Pending work remains owned by another AI Studio tab";
          ctx.requestRender();
          return;
        }
        if (ctx.state.runner.ownerTabId && ctx.state.runner.ownerTabId !== ctx.tabId && !leaseExpired()) {
          ctx.runnerOwnedByOtherTab = true;
          ctx.state.runner.lastHostState = "Runner is owned by another AI Studio tab";
          ctx.requestRender();
          return;
        }
        if (!await acquireRunnerLease()) {
          ctx.state.runner.lastHostState = "Runner is owned by another AI Studio tab";
          ctx.requestRender();
          return;
        }
        ctx.touchState();
        ctx.scheduleSave();
      }
      if (!await heartbeatRunnerLease()) return;
      if (clickOptInControls()) {
        ctx.touchState();
        ctx.scheduleSave();
      }
      if (ctx.state.runner.phase === PHASES.AWAITING || ctx.state.runner.phase === PHASES.RUNNING) {
        if (ctx.state.runner.submittedAt && Date.now() - ctx.state.runner.submittedAt > 120000) {
          Core.commitTransition(ctx.state, Core.EVENTS.VERIFY, { status: 'FAIL', reason: 'TIMEOUT' });
          Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.RETRY_WAIT });
          ctx.state.runner.nextActionAt = Date.now() + 5000;
          markPromptError("Silent host hang detected (2 minute timeout)");
          ctx.requestRender();
          return;
        }
      }
      if (ctx.state.runner.phase === PHASES.READY) beginSubmission(host);
      else if (ctx.state.runner.phase === PHASES.SUBMITTING) await finishSubmission(host);
      else {
        const decision = Core.decideRunnerTransition(ctx.state.runner, host, ctx.state.settings, Date.now());
        if (decision.action !== "none") await applyTransition(decision, host);
      }
      ctx.requestRender();
    } catch (error) {
      markPromptError(`Copilot error: ${error.message}`);
      ctx.scheduleSave();
    } finally {
      ctx.tickBusy = false;
    }
  }

  async function startRunner(scope = "stack") {
    if (ctx.state.runner.enabled) {
      ctx.mutate(() => { ctx.state.runner.lastError = "Pause the current runner before changing its execution scope"; });
      return;
    }
    const candidateState = ctx.state;
    const target = Core.nextStackTarget(candidateState, scope === "selected" ? { selectedOnly: true, startChainId: ctx.state.selectedChainId } : {});
    if (!target && !ctx.state.runner.pendingPromptId) {
      ctx.mutate(() => { ctx.state.runner.lastError = "Add at least one queued prompt to the selected run scope first"; });
      return;
    }
    if (!await acquireRunnerLease()) {
      ctx.mutate(() => { ctx.state.runner.lastError = "Another AI Studio tab owns the runner"; });
      return;
    }
    ctx.mutate(() => {
      ctx.state.runner.scope = scope;
      ctx.state.runner.scopeChainId = scope === "selected" ? ctx.state.selectedChainId : null;
      ctx.state.runner.enabled = true;
      Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: ctx.state.runner.pendingPromptId ? PHASES.READY : PHASES.READY });
      ctx.state.runner.sawBusy = false;
      ctx.state.runner.submittedAt = null;
      ctx.state.runner.lastError = null;
      ctx.state.runner.ownerTabId = ctx.tabId;
      ctx.state.runner.leaseUpdatedAt = Core.nowISO();
      ctx.addHistory("runner_started", scope === "selected" ? "Selected chain runner started" : "Stack runner started");
    void tick();    });
  }

  function pauseRunner() {
    if (ctx.state.runner.enabled && !ctx.leaseToken && ctx.state.runner.ownerTabId && ctx.state.runner.ownerTabId !== ctx.tabId) {
      ctx.mutate(() => { ctx.state.runner.lastError = "Only the tab that owns this runner can pause it"; });
      return;
    }
    const retainPendingLease = !!ctx.state.runner.pendingPromptId;
    if (!retainPendingLease) releaseRunnerLease();
    ctx.mutate(() => {
      ctx.state.runner.enabled = false;
      Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.PAUSED });
      ctx.state.runner.ownerTabId = retainPendingLease ? (ctx.state.runner.ownerTabId || ctx.tabId) : null;
      ctx.state.runner.leaseUpdatedAt = retainPendingLease ? Core.nowISO() : null;
      ctx.addHistory("runner_paused", "Paused runner");
    });
  }

  async function resumeRunner() {
    if (ctx.state.runner.pendingPromptId) {
      const currentKey = ctx.currentPageKey();
      if (ctx.isAppsListUpgrade(ctx.state.runner.boundPageKey, currentKey)) {
        ctx.mutate(() => { ctx.state.runner.boundPageKey = currentKey; });
      }
    }
    if (ctx.state.runner.pendingPromptId && !ctx.pageMatchesBinding()) {
      ctx.mutate(() => { ctx.state.runner.lastError = `Pending work is bound to ${ctx.state.runner.boundPageKey}; open that AI Studio app before resuming`; });
      return;
    }
    if (!await acquireRunnerLease()) {
      ctx.mutate(() => { ctx.state.runner.lastError = "Another AI Studio tab owns the runner"; });
      return;
    }
    ctx.mutate(() => {
      ctx.state.runner.enabled = true;
      ctx.state.runner.ownerTabId = ctx.tabId;
      ctx.state.runner.leaseUpdatedAt = Core.nowISO();
      if (ctx.state.runner.pendingPromptId) {
        const host = ctx.scanHost();
        ctx.state.runner.baselineTurnCount = Math.min(ctx.state.runner.baselineTurnCount, host.turnCount);
        Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: host.retryVisible ? PHASES.RETRY_WAIT : PHASES.AWAITING });
        ctx.state.runner.nextActionAt = host.retryVisible ? Date.now() : null;
        // Reset the submission clock so timeouts don't immediately fire based on original submit time
        ctx.state.runner.submittedAt = Date.now();
      } else Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.READY });
      ctx.state.runner.lastError = null;
      ctx.addHistory("runner_resumed", "Runner resumed");
    void tick();    });
  }

  async function recoverPendingHere() {
    if (!ctx.state.runner.pendingPromptId) return;
    const currentKey = ctx.currentPageKey();
    let recoveredPageKey = null;
    if (ctx.isAppsListUpgrade(ctx.state.runner.boundPageKey, currentKey)) {
      if (!confirm("Recover the pending start-page submission in this app? Only continue if this is the app created by that submission.")) return;
      recoveredPageKey = currentKey;
    } else if (!ctx.pageMatchesBinding()) {
      ctx.mutate(() => { ctx.state.runner.lastError = `This pending prompt belongs to ${ctx.state.runner.boundPageKey}, not ${currentKey}`; });
      return;
    }
    if (!await acquireRunnerLease()) {
      ctx.mutate(() => { ctx.state.runner.lastError = "The original runner tab is still active; recover from that tab or wait for its lease to expire"; });
      return;
    }
    ctx.mutate(() => {
      const host = ctx.scanHost();
      if (recoveredPageKey) ctx.state.runner.boundPageKey = recoveredPageKey;
      ctx.state.runner.enabled = true;
      ctx.state.runner.ownerTabId = ctx.tabId;
      ctx.state.runner.leaseUpdatedAt = Core.nowISO();
      Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: host.retryVisible ? PHASES.RETRY_WAIT : PHASES.AWAITING });
      ctx.state.runner.nextActionAt = host.retryVisible ? Date.now() : null;
      // Reset the submission clock so timeouts don't fire based on original submit time
      ctx.state.runner.submittedAt = Date.now();
      ctx.state.runner.lastError = null;
      ctx.addHistory("runner_recovered", "Pending runner explicitly recovered in its bound app");
    void tick();    });
  }

  function skipPrompt() {
    if (ctx.state.runner.enabled && !ctx.leaseToken) {
      ctx.mutate(() => { ctx.state.runner.lastError = "Only the owner tab can skip the running prompt"; });
      return;
    }
    const prompt = ctx.runnerPrompt() || Core.nextStackTarget(ctx.state, ctx.state.runner.scope === "selected" ? { selectedOnly: true, startChainId: ctx.state.selectedChainId } : {})?.prompt;
    if (!prompt) return;
    const result = ctx.command("SKIP_PROMPT", { promptId: prompt.id }, { history: { kind: "skipped", message: `Skipped ${prompt.label}`, data: { promptId: prompt.id } } });
    if (result.ok) void tick();  }

  function resetSelectedChain() {
    const chain = ctx.selectedChain();
    if (!chain) return;
    if (!confirm(`Reset all prompts in ${chain.name}?`)) return;
    ctx.command("RESET_CHAIN", { chainId: chain.id }, { history: { kind: "chain_reset", message: `Reset ${chain.name}` } });
  }


  Object.assign(ctx, {
    startRunner,
    pauseRunner,
    resumeRunner,
    recoverPendingHere,
    skipPrompt,
    resetSelectedChain,    releaseRunnerLease,
    clickOptInControls,
    renderCountdowns,
    tick
  });
  console.log("[AISQ] runner.js loaded successfully. ctx.tick is now:", typeof ctx.tick);
} catch (err) {
  console.error("[AISQ] ERROR in runner.js initialization:", err);
}
})(typeof globalThis !== "undefined" ? globalThis : this);