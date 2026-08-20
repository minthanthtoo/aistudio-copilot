(function initAISQUITabPrompts(global) {
  "use strict";
  const Core = global.AISQCore;
  const ctx = global.AISQContext;
  const { el, button, field } = global.AISQUIUtils;

  function renderPrompts() {
    const chain = ctx.selectedChain();
    const wrap = el("div", { className: "aisq-section" });
    if (!ctx.state.chains || !ctx.state.chains.length) {
      wrap.append(el("p", { className: "aisq-copy", text: "No chains yet. Paste a prompt pack in Build." }));
      return wrap;
    }
    if (!chain) {
      wrap.append(el("p", { className: "aisq-copy", text: "Select a chain from the Queue tab to inspect it." }));
      return wrap;
    }

    const select = el("select", { className: "aisq-select" });
    (ctx.state.chains || []).forEach((candidate) => {
      const option = el("option", { value: candidate.id, text: `${candidate.name} (${candidate.prompts.length})` });
      option.selected = candidate.id === ctx.state.selectedChainId;
      select.append(option);
    });
    select.addEventListener("change", () => ctx.command("SELECT_CHAIN", { chainId: select.value }));
    wrap.append(field("Inspect chain", select, ctx.runnerPrompt() ? "Inspection is independent from the chain currently running." : ""));

    const name = el("input", { className: "aisq-input", value: chain.name });
    name.addEventListener("change", () => ctx.command("RENAME_CHAIN", { chainId: chain.id, name: name.value }));
    wrap.append(field("Chain name", name));
    const counts = Core.chainCounts(chain);
    wrap.append(el("div", { className: "aisq-meter", text: `${counts.complete}/${counts.total} complete · ${counts.queued} queued · ${counts.error} errors · ${counts.skipped} skipped` }));

    const list = el("div", { className: "aisq-prompt-list" });
    const hasPreface = !!(chain.preface && chain.preface.trim());
    const activePrefaceCount = chain.prompts.filter(p => p.includePreface !== false).length;
    
    const prefaceEditor = el("textarea", { 
      className: "aisq-prompt-editor aisq-preface-editor", 
      value: chain.preface || "",
      placeholder: "Type a shared intro / system context here to prepend to your prompts before execution..."
    });
    prefaceEditor.addEventListener("change", () => ctx.command("EDIT_PREFACE", { chainId: chain.id, text: prefaceEditor.value }));
    prefaceEditor.addEventListener("input", () => {
      chain.preface = Core.normalizeText(prefaceEditor.value);
    });

    const allIncluded = chain.prompts.every(p => p.includePreface !== false);
    const includeAllToggle = button(
      allIncluded ? "Exclude from all" : "Include in all", 
      () => ctx.command("TOGGLE_ALL_PREFACES", { chainId: chain.id, include: !allIncluded }),
      allIncluded ? "ghost aisq-preface-on" : "ghost"
    );
    includeAllToggle.title = allIncluded 
      ? "System Context is currently enabled on all prompts in this chain. Click to exclude from all." 
      : "Click to enable System Context on all prompts in this chain.";

    const prefaceBadge = el("span", { 
      className: `aisq-preface-badge ${hasPreface ? "" : "empty"}`, 
      text: hasPreface ? `${activePrefaceCount}/${chain.prompts.length} active · ${chain.preface.length}c` : "empty" 
    });

    const extractIntroBtn = !hasPreface
      ? button("⚡ Extract Intro", () => {
          ctx.command("EXTRACT_CHAIN_PREFACE", { chainId: chain.id });
        }, "ghost aisq-btn-extract", "Auto-extract shared intro from prompts into System Context")
      : null;

    const clearPreface = hasPreface
      ? button("Clear", () => {
          if (confirm("Clear System Context text for this chain?")) ctx.command("EDIT_PREFACE", { chainId: chain.id, text: "" });
        }, "danger ghost")
      : null;

    const prefaceSummary = el("summary", { className: "aisq-prompt-head aisq-preface-head" }, [
      el("strong", { text: "System Context (Intro)" }),
      prefaceBadge,
      ...(extractIntroBtn ? [extractIntroBtn] : []),
      includeAllToggle,
      ...(clearPreface ? [clearPreface] : [])
    ]);
    const prefaceDetails = el("details", { className: "aisq-prompt aisq-preface-card" }, [prefaceSummary, prefaceEditor]);
    if (hasPreface) prefaceDetails.open = true;
    list.append(prefaceDetails);

    chain.prompts.forEach((prompt, index) => {
      const locked = prompt.status === "pending" || prompt.status === "complete" || ctx.state.runner.pendingPromptId === prompt.id;
      const editor = el("textarea", { className: "aisq-prompt-editor", value: prompt.text, disabled: locked });
      editor.addEventListener("change", () => ctx.command("EDIT_PROMPT", { chainId: chain.id, promptId: prompt.id, text: editor.value }));
      const up = button("↑", () => ctx.command("MOVE_PROMPT", { chainId: chain.id, promptId: prompt.id, direction: -1 }), "ghost", `Move ${prompt.label} earlier`);
      const down = button("↓", () => ctx.command("MOVE_PROMPT", { chainId: chain.id, promptId: prompt.id, direction: 1 }), "ghost", `Move ${prompt.label} later`);
      up.disabled = locked || index === 0 || ["pending", "complete"].includes(chain.prompts[index - 1]?.status);
      down.disabled = locked || index === chain.prompts.length - 1 || ["pending", "complete"].includes(chain.prompts[index + 1]?.status);
      const merge = button("Merge", () => ctx.command("MERGE_PROMPT", { chainId: chain.id, promptId: prompt.id }), "ghost");
      const remove = button("Delete", () => ctx.command("DELETE_PROMPT", { chainId: chain.id, promptId: prompt.id }), "danger ghost");
      
      const controls = [up, down, merge, remove];
      const isIntroActive = hasPreface && prompt.includePreface !== false;
      const togglePreface = button(
        !hasPreface ? "Intro (No System Context)" : (isIntroActive ? "✓ Intro On" : "✕ Intro Off"), 
        () => ctx.command("TOGGLE_PROMPT_PREFACE", { chainId: chain.id, promptId: prompt.id, include: prompt.includePreface === false }),
        !hasPreface ? "ghost aisq-preface-disabled" : (isIntroActive ? "ghost aisq-preface-on" : "ghost aisq-preface-off")
      );
      togglePreface.title = !hasPreface 
        ? "No text configured in System Context (Intro) above." 
        : (isIntroActive ? "System Context is currently prepended to this prompt. Click to turn off." : "System Context is excluded from this prompt. Click to turn on.");
      controls.unshift(togglePreface);
      
      const runNext = button("Run Next", () => ctx.command("REORDER_TO_NEXT", { chainId: chain.id, promptId: prompt.id }), "ghost");
      runNext.title = "Move this prompt to be the immediate next target in the queue";
      controls.unshift(runNext);

      controls.forEach((control) => { 
        control.disabled = locked || prompt.status === "skipped";
        control.addEventListener("click", (e) => e.stopPropagation());
      });
      const isRunning = ctx.state.runner.pendingPromptId === prompt.id;
      const isPaused = isRunning && !ctx.state.runner.enabled;
      let highlightClass = "";
      if (isRunning) highlightClass = isPaused ? " aisq-highlight-paused" : " aisq-highlight-running";
      
      let prefaceBanner = null;
      if (hasPreface && isIntroActive) {
        const snippet = chain.preface.length > 70 ? chain.preface.slice(0, 67) + "..." : chain.preface;
        prefaceBanner = el("div", { className: "aisq-preface-attached-banner", title: `Prepended preface:\n${chain.preface}` }, [
          el("span", { className: "aisq-preface-attached-tag", text: "📌 +Intro" }),
          el("span", { className: "aisq-preface-attached-text", text: snippet })
        ]);
      }

      const details = el("details", { className: `aisq-prompt aisq-${prompt.status}${highlightClass}` });
      if (isRunning || prompt.status === "error") details.open = true;
      const indexBadge = el("span", { className: "aisq-index", text: `${index + 1}`, title: "Click or double-click to set as current prompt" });
      const summary = el("summary", { className: "aisq-prompt-head" }, [indexBadge, el("strong", { text: prompt.label }), el("span", { className: "aisq-status", text: prompt.status }), ...controls]);
      
      const triggerJump = (e) => {
        if (e && e.target && e.target.closest("button")) return;
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        const doJump = () => ctx.command("JUMP_TO_PROMPT", { chainId: chain.id, promptId: prompt.id });
        if (ctx.state.settings.skipJumpWarning) {
          doJump();
        } else {
          const dialog = el("dialog", { className: "aisq-dialog" });
          const title = el("h3", { text: "Set Current Prompt" });
          const msg = el("p", { text: `Jump to prompt ${index + 1} (${prompt.label})? Earlier pending prompts will be marked skipped.` });
          const label = el("label", { className: "aisq-checkbox-label" });
          const checkbox = el("input", { type: "checkbox" });
          label.append(checkbox, document.createTextNode(" Do not show again"));
          
          const cancel = button("Cancel", () => dialog.remove(), "ghost");
          const confirmBtn = button("Continue", () => {
            if (checkbox.checked) ctx.command("UPDATE_SETTINGS", { skipJumpWarning: true });
            dialog.remove();
            doJump();
          }, "primary");
          
          const actions = el("div", { className: "aisq-actions" }, [cancel, confirmBtn]);
          dialog.append(title, msg, label, actions);
          ctx.shadow.append(dialog);
          dialog.showModal();
        }
      };

      indexBadge.addEventListener("click", triggerJump);
      
      let lastPromptClick = 0;
      summary.addEventListener("click", (e) => {
        if (e.target.closest("button") || e.target.closest(".aisq-index")) return;
        const now = Date.now();
        if (now - lastPromptClick < 450) {
          lastPromptClick = 0;
          triggerJump(e);
        } else {
          lastPromptClick = now;
        }
      });
      
      const moveIntroBtn = !hasPreface && prompt.text.includes("\n\n")
        ? button("✂️ Move 1st para to System Context", () => {
            ctx.command("MOVE_PARAGRAPH_TO_PREFACE", { chainId: chain.id, promptId: prompt.id });
          }, "ghost aisq-move-intro-btn", "Move the first paragraph of this prompt into the shared Preface")
        : null;

      const detailsChildren = [
        summary,
        prefaceBanner,
        moveIntroBtn,
        editor,
        prompt.error ? el("div", { className: "aisq-error", text: prompt.error }) : null,
        prompt.status === "complete" ? button("Reset from here", () => {
          if (confirm(`Reset ${prompt.label} and all later prompts?`)) ctx.command("RESET_FROM_PROMPT", { chainId: chain.id, promptId: prompt.id });
        }, "ghost") : null
      ].filter(Boolean);
      details.append(...detailsChildren);
      list.append(details);
    });
    const addPromptText = el("input", { className: "aisq-input", placeholder: "New prompt text" });
    const addPrompt = () => { const result = ctx.command("ADD_PROMPT", { chainId: chain.id, text: addPromptText.value }); if (result.ok) addPromptText.value = ""; };
    const deleteChain = button("Delete chain", () => {
      if (confirm(`Delete ${chain.name}? This removes its prompts.`)) {
        const res = ctx.command("DELETE_CHAIN", { chainId: chain.id }, { history: { kind: "chain_deleted", message: `Deleted ${chain.name}` } });
        if (res.ok) ctx.toast(`🗑 Deleted "${chain.name}"`, "info");
      }
    }, "danger ghost");
    const duplicate = button("Duplicate chain", () => {
      const res = ctx.command("DUPLICATE_CHAIN", { chainId: chain.id }, { history: { kind: "chain_duplicated", message: `Duplicated ${chain.name}` } });
      if (res.ok) ctx.toast(`✅ Duplicated "${chain.name}"`, "success");
    }, "ghost");
    const extractPrefaceBtn = button("Extract shared intro", () => {
      ctx.command("EXTRACT_CHAIN_PREFACE", { chainId: chain.id });
    }, "ghost", "Detect and extract repeating intro text from prompts into System Context (Intro)");
    const skip = button("Skip chain", () => ctx.command("SKIP_CHAIN", { chainId: chain.id }, { history: { kind: "chain_skipped", message: `Skipped ${chain.name}` } }), "ghost");
    wrap.append(list, field("Add prompt", addPromptText), el("div", { className: "aisq-actions" }, [button("Add prompt", addPrompt, "primary"), duplicate, extractPrefaceBtn, skip, button("Reset chain", ctx.resetSelectedChain, "ghost"), deleteChain]));
    return wrap;
  }


  Object.assign(ctx, { renderPrompts });
})(typeof globalThis !== "undefined" ? globalThis : this);
