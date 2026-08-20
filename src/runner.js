(function initAISQRunner(global) {
  "use strict";
  console.log("[AISQ] runner.js top-level execution started!");
try {
  const Core = global.AISQCore;
  const ctx = global.AISQContext;
  const PHASES = Core.PHASES;

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
    resetSelectedChain,
    tick
  });
  console.log("[AISQ] runner.js loaded successfully. ctx.tick is now:", typeof ctx.tick);
} catch (err) {
  console.error("[AISQ] ERROR in runner.js initialization:", err);
  throw err;
}
})(typeof globalThis !== "undefined" ? globalThis : this);
