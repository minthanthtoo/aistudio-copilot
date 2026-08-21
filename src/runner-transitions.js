(function initAISQRunnerTransitions(global) {
  "use strict";
  const Core = global.AISQCore;
  const ctx = global.AISQContext;
  const PHASES = Core.PHASES;

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
        ctx.state.runner.lastHostState = host.lastHeader || "Completed; verifying stable state";
        break;
      case "complete_prompt": {
        if (!prompt || !chain) return ctx.markPromptError("Completion arrived without a pending prompt");
        prompt.status = "complete";
        prompt.completedAt = Core.nowISO();
        prompt.error = null;
        chain.updatedAt = Core.nowISO();
        ctx.addHistory("completed", `Completed ${prompt.label}`, { chainId: chain.id, promptId: prompt.id, header: host.lastHeader });
        ctx.state.runner.pendingPromptId = null;
        ctx.state.runner.retryCount = 0;
        const target = ctx.nextTarget();
        ctx.state.runner.nextTarget = target ? { chainId: target.chain.id, promptId: target.prompt.id } : null;
        const sameChain = target && target.chain.id === chain.id;
        if (!target) {
          ctx.finishRun();
        } else if (ctx.state.settings.stopAfterChain && !sameChain) {
          Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.PAUSED });
          ctx.state.runner.enabled = false;
          ctx.state.runner.lastHostState = "Chain complete; stopped before the next chain";
          ctx.state.runner.ownerTabId = null;
          ctx.releaseRunnerLease();
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
          ctx.releaseRunnerLease();
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
        if (!host.retry || !ctx.visible(host.retry)) return ctx.markPromptError("Retry control disappeared");
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
          const target = ctx.nextTarget();
          ctx.state.runner.nextTarget = target ? { chainId: target.chain.id, promptId: target.prompt.id } : null;
          if (!target) ctx.finishRun("Stack completed after skipping a failed prompt");
          else if (ctx.state.settings.autoRun) {
            Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.PACING });
            ctx.state.runner.nextActionAt = Date.now() + ctx.state.settings.interPromptDelayMs;
          } else {
            ctx.state.runner.enabled = false;
            Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.PAUSED });
            ctx.state.runner.ownerTabId = null;
            ctx.releaseRunnerLease();
          }
          ctx.addHistory("failure_skipped", `Skipped failed prompt ${prompt.label}`);
        } else if (policy === "skip_chain" && chain) {
          for (const item of chain.prompts) if (["queued", "error", "pending"].includes(item.status)) item.status = "skipped";
          ctx.state.runner.pendingPromptId = null;
          const target = ctx.nextTarget();
          ctx.state.runner.nextTarget = target ? { chainId: target.chain.id, promptId: target.prompt.id } : null;
          if (!target) ctx.finishRun("Stack completed after skipping a failed chain");
          else if (ctx.state.settings.autoRun) {
            Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.PACING });
            ctx.state.runner.nextActionAt = Date.now() + ctx.state.settings.interChainDelayMs;
          } else {
            ctx.state.runner.enabled = false;
            Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.PAUSED });
            ctx.state.runner.ownerTabId = null;
            ctx.releaseRunnerLease();
          }
          ctx.addHistory("failure_chain_skipped", `Skipped failed chain ${chain.name}`);
        } else {
          ctx.markPromptError(decision.message || "AI Studio run failed");
        }
        break;
      }
      case "timeout":
        ctx.markPromptError(decision.message || "AI Studio run failed");
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
      if (allow && ctx.enabled(allow) && !ctx.clickedOptInControls.has(allow)) {
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
      if (fix && ctx.enabled(fix) && !ctx.clickedOptInControls.has(fix)) {
        if (!ctx.activeCountdown) {
          ctx.stashText();
          ctx.activeCountdown = { type: "autofix", button: fix, expires: Date.now() + 3000 };
          ctx.requestRender();
        } else if (Date.now() >= ctx.activeCountdown.expires) {
          ctx.clickedOptInControls.add(fix);
          ctx.robustClick(fix);
          ctx.addHistory("host_action", `Clicked ${ctx.textOf(fix)}`);
          ctx.activeCountdown = null;
          setTimeout(() => ctx.restoreText(), 2600);
          changed = true;
          ctx.requestRender();
        }
      } else if (ctx.activeCountdown?.type === "autofix") {
        ctx.restoreText();
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


  Object.assign(ctx, { applyTransition, clickOptInControls, renderCountdowns });
})(typeof globalThis !== "undefined" ? globalThis : this);
