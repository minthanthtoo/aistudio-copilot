import re

with open("src/content.js", "r") as f:
    content = f.read()

# 1. Add css
css_add = """      .aisq-toast-container { position:fixed; right:18px; bottom:80px; z-index:2147483648; display:flex; flex-direction:column; gap:8px; pointer-events:none; }
      @keyframes aisq-toast-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      @keyframes aisq-toast-out { from { opacity: 1; } to { opacity: 0; transform: translateY(-10px); } }
      .aisq-toast { pointer-events:auto; padding:10px 14px; border-radius:10px; background:#1d1c22; border:1px solid #ffffff20; color:#f5f4fa; font-size:12px; box-shadow:0 8px 24px rgba(0,0,0,0.4); animation:aisq-toast-in 0.3s ease-out; display:flex; align-items:center; gap:8px; max-width:320px; word-break:break-word; }
      .aisq-toast.success { border-color:rgba(85,230,155,0.4); }
      .aisq-toast.error { border-color:rgba(255,109,105,0.4); }
      .aisq-toast.undo { border-color:rgba(185,169,255,0.4); }
      .aisq-toast-undo-btn { margin-left:auto; background:rgba(115,87,255,0.15); border:1px solid rgba(115,87,255,0.3); color:#b9a9ff; padding:2px 8px; border-radius:6px; cursor:pointer; font-weight:600; font-size:11px; }
      .aisq-toast-undo-btn:hover { background:rgba(115,87,255,0.25); color:#fff; }
      @keyframes aisq-chain-glow { 0% { box-shadow:0 0 0 3px rgba(115,87,255,0.6); } 100% { box-shadow:0 0 0 0 transparent; } }
      .aisq-chain-card.just-imported { animation:aisq-chain-glow 1.5s ease-out; }
      .aisq-quickstart-card { transition:transform 0.15s, box-shadow 0.15s, border-color 0.15s; border:1px solid #ffffff16; border-radius:11px; background:#1d1c22; padding:12px; cursor:pointer; display:flex; flex-direction:column; align-items:flex-start; text-align:left; }
      .aisq-quickstart-card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(115,87,255,0.15); border-color:#7357ff; }
      .aisq-detect-badge { position:absolute; right:8px; top:8px; font-size:10px; padding:2px 8px; border-radius:999px; background:rgba(115,87,255,0.15); color:#b9a9ff; font-weight:600; }
"""
content = content.replace("    shadow.append(style);\n  }", css_add + "    shadow.append(style);\n  }")

# 2. Add toast logic
toast_logic = """
  let toastContainer;
  function toast(message, type = "info", options = {}) {
    if (!toastContainer) {
      toastContainer = ctx.el("div", { className: "aisq-toast-container" });
      shadow.append(toastContainer);
    }
    const t = ctx.el("div", { className: `aisq-toast ${type}`, text: message });
    if (options.onUndo) {
      const undoBtn = ctx.el("button", { className: "aisq-toast-undo-btn", text: "↩ Undo", on: { click: () => { options.onUndo(); dismiss(); } } });
      t.append(undoBtn);
    }
    toastContainer.append(t);
    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      t.style.animation = "aisq-toast-out 0.2s ease-in forwards";
      setTimeout(() => t.remove(), 200);
    };
    setTimeout(dismiss, 4000);
  }
"""

content = content.replace("  let lastRenderedStateKey = \"\";", toast_logic + "\n  let lastRenderedStateKey = \"\";")

# 3. Rename "stack" to "queue" in tabs
content = content.replace(
    'for (const tab of ["build", "stack", "prompts", "run", "settings"]) tabs.append(ctx.el("button", { className: `aisq-tab ${state.settings.activeTab === tab ? "active" : ""}`, type: "button", text: tab === "prompts" ? `prompts${promptBadge}` : tab, role: "tab", ariaSelected: state.settings.activeTab === tab, on: { click: () => mutate(() => { state.settings.activeTab = tab; }) } }));',
    'for (const tab of ["build", "stack", "prompts", "run", "settings"]) tabs.append(ctx.el("button", { className: `aisq-tab ${state.settings.activeTab === tab ? "active" : ""}`, type: "button", text: tab === "prompts" ? `prompts${promptBadge}` : (tab === "stack" ? "queue" : tab), role: "tab", ariaSelected: state.settings.activeTab === tab, on: { click: () => mutate(() => { state.settings.activeTab = tab; }) } }));'
)

# 4. Add toast to export context
content = content.replace(
    "    hostMode: () => hostMode,",
    "    hostMode: () => hostMode,\n    toast,"
)

with open("src/content.js", "w") as f:
    f.write(content)
