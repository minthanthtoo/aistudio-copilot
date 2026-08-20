(function initAISQUITabSettings(global) {
  "use strict";
  const Core = global.AISQCore;
  const ctx = global.AISQContext;
  const { el, button, field, numberSetting, checkboxSetting } = global.AISQUIUtils;

  function renderSettings() {
    const autonomy = el("select", { className: "aisq-select" });
    if (typeof AISQAuthority !== "undefined") {
      const levels = Object.values(AISQAuthority.LEVELS).sort((a, b) => a.level - b.level);
      const currentLevel = AISQAuthority.inferLevel(ctx.state.settings);
      for (const level of levels) {
        const option = el("option", { value: level.name, text: `${level.name} - ${level.description}` });
        option.selected = currentLevel.level === level.level;
        option.disabled = level.level >= 4; // L4 locked until Phase 4
        autonomy.append(option);
      }
      autonomy.disabled = true; // Read-only in Phase 3, inferred from below
    }

    const failure = el("select", { className: "aisq-select" });
    for (const [value, label] of [["pause", "Pause on failure"], ["skip_prompt", "Skip failed prompt"], ["skip_chain", "Skip failed chain"]]) {
      const option = el("option", { value, text: label });
      option.selected = ctx.state.settings.failurePolicy === value;
      failure.append(option);
    }
    failure.addEventListener("change", () => ctx.mutate(() => { ctx.state.settings.failurePolicy = failure.value; }));
    const placement = el("select", { className: "aisq-select" });
    for (const [value, label] of [["end", "Append new pastes to end"], ["after", "Insert after selected chain"]]) {
      const option = el("option", { value, text: label });
      option.selected = ctx.state.settings.pastePlacement === value;
      placement.append(option);
    }
    placement.addEventListener("change", () => ctx.mutate(() => { ctx.state.settings.pastePlacement = placement.value; }));
    return el("div", { className: "aisq-section" }, [
      field("Autonomy Level", autonomy),
      checkboxSetting("autoRun", "Continue automatically across the queue", "Turn off for one-at-a-time manual Resume control."),
      checkboxSetting("autoRetry", "Automatically retry AI Studio failures", "Retries only the newest failed turn."),
      checkboxSetting("stopAfterChain", "Pause after the current chain", "Useful for reviewing output before the next paste chain."),
      field("New-paste placement", placement),
      field("Failure policy", failure),
      numberSetting("maxRetries", "Maximum retries (0 = unlimited)", 1, 0),
      numberSetting("retryDelayMs", "Retry delay (seconds)", 1000),
      numberSetting("settleMs", "Completion settle window (seconds)", 1000, 0.5),
      numberSetting("interPromptDelayMs", "Delay between prompts (seconds)", 1000),
      numberSetting("interChainDelayMs", "Delay between chains (seconds)", 1000),
      numberSetting("startTimeoutMs", "Start timeout (seconds)", 1000, 5),
      numberSetting("completionTimeoutMs", "Completion timeout (minutes)", 60000, 1),
      checkboxSetting("autoAllowAccess", "Click Allow access automatically", "Off by default."),
      checkboxSetting("autoFix", "Click AI Studio Auto-fix automatically", "Off by default because it can modify generated files."),
      checkboxSetting("autoDownloadOnDone", "Download ZIP after the whole queue completes"),
      el("div", { className: "aisq-shortcuts" }, [
        el("strong", { text: "Shortcuts" }), 
        el("span", { text: "Alt+Shift+A — toggle Copilot panel" }), 
        el("span", { text: "Alt+Enter — start/resume queue" }),
        button("Reload Extension (Dev)", () => {
          const btn = ctx.shadow.querySelector("button:focus");
          if (btn) btn.textContent = "Reloading...";
          chrome.runtime.sendMessage({ type: "AISQ_RELOAD_EXTENSION" });
        }, "ghost", "Hard-reloads the extension background worker and injects fresh content scripts without reloading the webpage")
      ])
    ]);
  }


  Object.assign(ctx, { renderSettings });

  console.log("[AISQ] UI tabs loaded successfully.");
  
  if (typeof ctx.init === "function") {
    ctx.init().catch(err => console.error("[AISQ] ERROR during init:", err));
  } else {
    console.error("[AISQ] SYNC ERROR: ctx.init is not a function!");
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
