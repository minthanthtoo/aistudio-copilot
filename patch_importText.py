with open("src/ui-tabs.js", "r") as f:
    content = f.read()

replacement = """  function importText(raw, strategy = ctx.state.ui.splitStrategy, options = {}) {
    const parsed = Core.parsePromptPack(raw, strategy);
    if (!parsed.prompts.length) {
      alert("No prompts found.");
      return { ok: false };
    }
    const chain = Core.makeChain({ name: options.name || "Imported Chain" });
    if (options.preface) chain.preface = options.preface;
    chain.prompts = parsed.prompts.map(p => Core.makePrompt(p));
    
    const placement = ctx.state.settings.insertAtBottom ? "bottom" : "after";
    const commandResult = ctx.command("IMPORT_CHAIN", { chain, placement, afterChainId: options.afterChainId || (placement === "after" ? ctx.state.selectedChainId : null) }, { history: { kind: "chain_imported", message: `Added ${chain.name} with ${parsed.prompts.length} prompt(s)`, data: { chainId: chain.id, strategy: parsed.strategy } } });
    
    if (commandResult.ok) {
      ctx.state.ui.lastImportId = chain.id;
      ctx.toast(`✅ Added "${chain.name}" (${parsed.prompts.length} prompts)`, "success", {
        onUndo: () => {
          ctx.command("DELETE_CHAIN", { chainId: chain.id }, { history: { kind: "undo_import", message: `Undo import of ${chain.name}` } });
          ctx.toast(`↩ Undid import of "${chain.name}"`, "undo");
        }
      });
      ctx.requestRender();
    }
    return commandResult;
  }"""

import re
content = re.sub(r'  function importText.*?return commandResult;\n  }', replacement, content, flags=re.DOTALL)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
