(function initAISQUITabStack(global) {
  "use strict";
  const Core = global.AISQCore;
  const ctx = global.AISQContext;
  const { el, button, field } = global.AISQUIUtils;
  const PHASES = Core.PHASES;

  function chainCard(chain, index) {
    const counts = Core.chainCounts(chain);
    let status = counts.pending ? "running" : counts.queued === 0 ? "done" : "queued";
    const selected = ctx.state.selectedChainId === chain.id;
    const isActive = ctx.state.runner.activeChainId === chain.id;
    const isPaused = isActive && !ctx.state.runner.enabled;
    let highlightClass = "";
    if (isActive) highlightClass = isPaused ? " aisq-highlight-paused" : " aisq-highlight-running";
    
    const justImported = ctx.state.ui && ctx.state.ui.lastImportId === chain.id;
    if (justImported) {
       highlightClass += " just-imported";
       setTimeout(() => { 
         if (ctx.state.ui.lastImportId === chain.id) { 
           ctx.state.ui.lastImportId = null; 
           ctx.requestRender(); 
         } 
       }, 2000);
    }
    
    const locked = isActive && ctx.state.runner.enabled;
    const card = el("div", { className: `aisq-chain-card ${locked ? "locked" : ""} ${selected ? "selected" : ""}${highlightClass}` });
    const previewText = (chain.preface ? chain.preface + "\n\n" : "") + chain.prompts.map((p) => p.text).join("\n\n");
    const titlePreview = previewText.length > 800 ? previewText.slice(0, 800) + "..." : previewText;
    
    const nameBtn = button(`${index + 1}. ${chain.name}`, () => {
      ctx.command("SELECT_CHAIN", { chainId: chain.id });
      ctx.mutate(() => { ctx.state.settings.activeTab = "prompts"; });
    }, selected ? "primary" : "ghost");
    nameBtn.title = titlePreview;
    
    let currentIndex = chain.prompts.findIndex(p => ["pending", "queued", "error"].includes(p.status));
    if (currentIndex === -1) currentIndex = chain.prompts.length;
    const displayIndex = currentIndex < counts.total ? currentIndex + 1 : counts.total;
    
    const runNext = button("Run Next", () => ctx.command("JUMP_TO_CHAIN", { chainId: chain.id }), "ghost", `Move ${chain.name} to be the immediate next target`);
    
    const upBtn = button("↑", () => ctx.command("MOVE_CHAIN", { chainId: chain.id, direction: -1 }), "ghost", `Move ${chain.name} up`);
    const downBtn = button("↓", () => ctx.command("MOVE_CHAIN", { chainId: chain.id, direction: 1 }), "ghost", `Move ${chain.name} down`);
    const bottomBtn = button("⤓", () => ctx.command("MOVE_CHAIN_TO_BOTTOM", { chainId: chain.id }), "ghost", `Move ${chain.name} to bottom`);
    
    if (isActive) {
      runNext.disabled = true;
      upBtn.disabled = true;
      downBtn.disabled = true;
      bottomBtn.disabled = true;
    }
    
    const head = el("div", { className: "aisq-chain-head" }, [
      nameBtn,
      el("span", { className: "aisq-status", text: `${status} · ${counts.total > 0 ? displayIndex : 0}/${counts.total}` }),
      runNext,
      upBtn,
      downBtn,
      bottomBtn,
      button((ctx.state.stackOrder || []).includes(chain.id) ? "–" : "+", () => ctx.command((ctx.state.stackOrder || []).includes(chain.id) ? "REMOVE_CHAIN_FROM_STACK" : "ADD_CHAIN_TO_STACK", { chainId: chain.id }), "ghost", (ctx.state.stackOrder || []).includes(chain.id) ? `Suspend ${chain.name}` : `Add ${chain.name} to stack`),
      button("✕", () => ctx.command("DELETE_CHAIN", { chainId: chain.id }), "danger ghost", `Delete ${chain.name}`)
    ]);
    
    const triggerChainJump = (e) => {
      if (e && e.target && e.target.closest("button:not(:first-child)")) return;
      if (locked) return;
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const doJump = () => ctx.command("FORCE_JUMP_TO_CHAIN", { chainId: chain.id });
      if (ctx.state.settings.skipJumpWarning) {
        doJump();
      } else {
        const dialog = el("dialog", { className: "aisq-dialog" });
        const title = el("h3", { text: "Jump to Chain" });
        const msg = el("p", { text: "You are jumping to a different chain. This will mark prompts in earlier pending chains as skipped. Continue?" });
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

    let lastChainClick = 0;
    head.addEventListener("click", (e) => {
      if (e.target.closest("button:not(:first-child)")) return;
      const now = Date.now();
      if (now - lastChainClick < 450) {
        lastChainClick = 0;
        triggerChainJump(e);
      } else {
        lastChainClick = now;
      }
    });
    card.append(head);
    return card;
  }

  function renderStack() {
    const wrap = el("div", { className: "aisq-section" });
    const stack = el("div", { className: "aisq-stack-list" });
    if (!ctx.state.chains || !ctx.state.chains.length) {
      wrap.append(el("p", { className: "aisq-copy", text: "No chains yet. Paste a prompt pack in Build." }));
      return wrap;
    }
    for (const [index, id] of (ctx.state.stackOrder || []).entries()) {
      const candidate = Core.getChainById(ctx.state, id);
      if (candidate) stack.append(chainCard(candidate, index));
    }
    const stored = (ctx.state.chains || []).filter((candidate) => !(ctx.state.stackOrder || []).includes(candidate.id));
    if (stored.length) {
      stack.append(el("div", { className: "aisq-help", text: "Stored but removed from queue" }));
      stored.forEach((candidate, index) => stack.append(chainCard(candidate, (ctx.state.stackOrder || []).length + index)));
    }
    wrap.append(el("div", { className: "aisq-stack-title" }, [el("strong", { text: "Execution Queue" }), el("span", { className: "aisq-copy", text: `${(ctx.state.stackOrder || []).length} chain(s)` })]), stack);
    return wrap;
  }


  Object.assign(ctx, { renderStack });
})(typeof globalThis !== "undefined" ? globalThis : this);
