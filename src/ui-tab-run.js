(function initAISQUITabRun(global) {
  "use strict";
  const Core = global.AISQCore;
  const ctx = global.AISQContext;
  const { el, button, field } = global.AISQUIUtils;
  const PHASES = Core.PHASES;

  function renderRun() {
    const counts = Core.stackCounts(ctx.state);
    const host = ctx.scanHost();
    const currentChain = ctx.runnerChain();
    const current = ctx.runnerPrompt();
    const phase = ctx.state.runner.phase.replaceAll("_", " ");
    const foreignPending = !!(ctx.state.runner.pendingPromptId && ctx.state.runner.ownerTabId && ctx.state.runner.ownerTabId !== ctx.tabId && !ctx.leaseToken);
    const stickyHeader = el("div", { className: "aisq-sticky-header" }, [
      el("div", { className: "aisq-run-card" }, [el("span", { className: `aisq-phase aisq-phase-${ctx.state.runner.phase}`, text: phase }), el("strong", { text: current?.label || currentChain?.name || "No active prompt" }), el("span", { className: "aisq-copy", text: `${counts.complete}/${counts.prompts} complete` })]),
      el("div", { className: "aisq-meter", text: `Queue: ${counts.chains} chain(s) · ${counts.queued} queued · ${counts.pending} pending · ${counts.error} errors` })
    ]);
    return el("div", { className: "aisq-section" }, [
      stickyHeader,
      el("div", { className: "aisq-host-grid" }, [el("span", { text: "Page" }), el("strong", { text: host.mode }), el("span", { text: "AI Studio" }), el("strong", { text: host.lastHeader || host.state }), el("span", { text: "Turns" }), el("strong", { text: `${host.turnCount} (baseline ${ctx.state.runner.baselineTurnCount || 0})` }), el("span", { text: "Retries" }), el("strong", { text: `${ctx.state.runner.retryCount || 0}/${Number(ctx.state.settings.maxRetries || 0) === 0 ? "∞" : ctx.state.settings.maxRetries}` })]),
      ctx.runnerOwnedByOtherTab || foreignPending ? el("div", { className: "aisq-error", text: "Another AI Studio tab owns the pending runner. Recover here only in the same bound app after the original tab closes or its lease expires." }) : null,
      ctx.state.runner.crashRecovery ? el("div", { className: "aisq-error aisq-crash-banner" }, [
        el("strong", { text: "⚠️ Rehydrated from Crash" }),
        el("br"),
        el("span", { text: "The browser or extension restarted unexpectedly while the runner was active. Please verify AI Studio state before resuming." }),
        el("br"),
        button("Dismiss", () => { ctx.mutate(() => { ctx.state.runner.crashRecovery = false; }); }, "ghost")
      ]) : null,
      ctx.state.runner.lastError ? el("div", { className: "aisq-error", text: ctx.state.runner.lastError }) : null,
      ctx.exportStep ? el("div", { className: "aisq-meter", text: ctx.exportStep }) : null,
      
      (function() {
        if (typeof AISQAuthority !== "undefined" && AISQAuthority.inferLevel(ctx.state.settings).level < 4) {
          return el("div", { className: "aisq-lock-banner", style: "margin: 8px 0; padding: 8px; border-left: 3px solid #fbbc04; background: #fff8e1;" }, [
            el("strong", { text: "🔒 Architectural Review" }),
            el("div", { text: "L4 Autonomy is locked until Phase 4 execution engine is fully complete." })
          ]);
        }
        return null;
      })(),

      (function() {
        const activeGoal = ctx.state.goals ? ctx.state.goals.find(g => g.status === 'active') : null;
        if (activeGoal) {
          return el("div", { className: "aisq-goal-dashboard", style: "margin: 8px 0; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" }, [
            el("strong", { text: "🎯 Active Goal" }),
            el("div", { text: activeGoal.description }),
            el("div", { className: "aisq-meter", text: `Plan: ${activeGoal.plan.steps.length} steps` })
          ]);
        }
        return null;
      })(),

      (function() {
        if (ctx.state.memory && ctx.state.memory.learnedPreferences && ctx.state.memory.learnedPreferences.length > 0) {
          return el("div", { className: "aisq-memory-dashboard", style: "margin: 8px 0; padding: 8px; border: 1px solid #cce5ff; border-radius: 4px; background: #e6f2ff;" }, [
            el("strong", { text: "🧠 Learned Memory" }),
            ...ctx.state.memory.learnedPreferences.slice(-3).map(p => el("div", { text: `• ${p.text}` }))
          ]);
        }
        return null;
      })(),

      el("div", { className: "aisq-actions" }, [
        button("Download ZIP", () => void ctx.downloadZip(), "ghost"),
        button("Diagnostics", ctx.downloadDiagnostics, "ghost", "Download redacted Copilot diagnostics")
      ]),
      el("p", { className: "aisq-help", text: "The runner submits one prompt at a time, waits for a newer stable assistant turn, then advances through the editable queue without wrapping." })
    ]);
  }

  function stopActiveAI() {
    const host = ctx.scanHost();
    if (host.stop) {
      ctx.robustClick(host.stop);
      ctx.addHistory("ai_stopped", "User stopped AI Studio generation");
    }
    if (ctx.state.runner.enabled) {
      ctx.pauseRunner();
    } else {
      ctx.requestRender();
    }
  }

  function renderTopRunControls() {
    const isPromptsTab = ctx.state.settings.activeTab === "prompts";
    const startLabel = ctx.state.runner.phase === PHASES.PAUSED ? "▶️ Resume" : "▶️ Start";
    const foreignPending = !!(ctx.state.runner.pendingPromptId && ctx.state.runner.ownerTabId && ctx.state.runner.ownerTabId !== ctx.tabId && !ctx.leaseToken);
    
    const primaryControl = foreignPending
      ? button("🔁 Recover", () => { ctx.mutate(() => { ctx.state.uiIntent = { action: 'recover' }; }); }, "primary aisq-btn-highlight", "Explicitly recover the pending runner in this AI Studio app")
      : !ctx.state.runner.enabled
        ? button(startLabel, () => {
            ctx.mutate(() => {
              if (ctx.state.runner.phase === PHASES.PAUSED) ctx.state.uiIntent = { action: 'resume' };
              else ctx.state.uiIntent = { action: 'start', scope: 'stack' };
            });
          }, "primary aisq-btn-highlight")
        : (ctx.leaseToken || ctx.state.runner.ownerTabId === ctx.tabId || !ctx.state.runner.ownerTabId) ? button("⏸️ Pause", () => { ctx.mutate(() => { ctx.state.uiIntent = { action: 'pause' }; }); }, "aisq-btn-pause") : button("🔒 Locked", () => {}, "ghost", "Runner is owned by another AI Studio tab");

    const host = ctx.scanHost();
    const isHostBusy = host.busy || !!host.stop;
    const stopAiControl = (ctx.state.runner.enabled || ctx.state.runner.phase === PHASES.PAUSED) && isHostBusy && host.stop
      ? button("⏹️ Stop AI", stopActiveAI, "danger ghost aisq-btn-stop", "Stop current AI Studio generation immediately")
      : null;

    const runSelected = button("⏏️ Run Selected", () => { ctx.mutate(() => { ctx.state.uiIntent = { action: 'start', scope: 'selected' }; }); }, "ghost");
    runSelected.disabled = !isPromptsTab || ctx.state.runner.enabled || !!ctx.state.runner.pendingPromptId;

    const skipCurrent = button("⏭️ Skip", () => { ctx.mutate(() => { ctx.state.uiIntent = { action: 'skip' }; }); }, "ghost");
    skipCurrent.disabled = !isPromptsTab || foreignPending || (ctx.state.runner.enabled && !ctx.leaseToken);

    const currentChain = ctx.runnerChain();
    const current = ctx.runnerPrompt();
    let phaseText = ctx.state.runner.phase.replaceAll("_", " ");
    if (isHostBusy && host.thinkingText) {
      phaseText = `${phaseText} · ${host.thinkingText}`;
    }
    const targetText = current?.label || currentChain?.name || "No active prompt";

    // Mode status pill
    let modePillClass = "aisq-host-badge";
    let modeText = "Searching...";
    if (host.mode === "editor") {
      if (isHostBusy) {
        modePillClass += " aisq-host-busy";
        modeText = host.thinkingText || "AI Generating";
      } else {
        modePillClass += " aisq-host-editor";
        modeText = "Editor Ready";
      }
    } else if (host.mode === "start") {
      modePillClass += " aisq-host-start";
      modeText = "Start Page";
    } else {
      modePillClass += " aisq-host-unsupported";
      modeText = "Not in Apps";
    }
    const hostPill = el("span", { className: modePillClass, text: modeText });

    let autonomyPill = null;
    if (typeof AISQAuthority !== "undefined") {
      const level = AISQAuthority.inferLevel(ctx.state.settings);
      const isL4 = level.level >= 4;
      autonomyPill = el("span", { className: `aisq-host-badge ${isL4 ? 'aisq-l4' : ''}`, text: level.name.split(':')[0] });
    }

    const controls = [primaryControl];
    if (stopAiControl) controls.push(stopAiControl);
    controls.push(runSelected, skipCurrent);

    return el("div", { className: "aisq-top-run-controls" }, [
      ...controls,
      el("div", { className: "aisq-top-status" }, [
        autonomyPill,
        hostPill,
        el("span", { className: `aisq-phase aisq-phase-${ctx.state.runner.phase}`, text: phaseText }),
        el("strong", { text: targetText })
      ].filter(Boolean))
    ]);
  }


  Object.assign(ctx, { renderRun, stopActiveAI, renderTopRunControls });
})(typeof globalThis !== "undefined" ? globalThis : this);
