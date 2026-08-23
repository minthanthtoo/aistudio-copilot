with open("src/ui-tabs.js", "r") as f:
    content = f.read()

replacement = """  function renderCrossProjectImport() {
    const otherProjects = Core.getAllProjects(ctx.state).filter(p => p.key !== Core.getCurrentPageKey() && p.chains?.length);
    
    const importWrap = el("div", { style: "margin-top: 16px; padding: 12px; background: rgba(115, 87, 255, 0.05); border: 1px dashed rgba(115, 87, 255, 0.3); border-radius: 8px; display: flex; flex-direction: column; gap: 8px;" }, [
      el("strong", { text: "Import chains from another project", style: "font-size: 12px; color: #a78bfa;" })
    ]);
    
    if (!otherProjects.length) {
      importWrap.append(el("div", { style: "font-size: 11px; color: #666;", text: "No other populated projects found in this browser." }));
      return importWrap;
    }

    const select = el("select", { className: "aisq-select" }, [el("option", { text: "-- Select a chain to copy --", value: "" })]);
    const previewContainer = el("div", { style: "margin-top: 8px;" });

    for (const p of otherProjects) {
      const group = el("optgroup", { label: `App: ${p.key}` });
      for (const c of p.chains) group.append(el("option", { value: `${p.key}|${c.id}`, text: `${c.name} (${c.prompts.length} prompts)` }));
      select.append(group);
    }
    
    let selectedSourceChain = null;
    let selectedProjectKey = null;

    select.addEventListener("change", (e) => {
      previewContainer.innerHTML = "";
      if (!e.target.value) {
        selectedSourceChain = null;
        selectedProjectKey = null;
        ctx.requestRender();
        return;
      }
      const [sourceProjectKey, chainId] = e.target.value.split("|");
      selectedProjectKey = sourceProjectKey;
      const sourceProject = otherProjects.find(p => p.key === sourceProjectKey);
      selectedSourceChain = sourceProject?.chains.find(c => c.id === chainId);
      
      if (selectedSourceChain) {
        const previewText = selectedSourceChain.preface || (selectedSourceChain.prompts[0] ? selectedSourceChain.prompts[0].text : "Empty chain");
        const previewSnippet = previewText.substring(0, 100) + (previewText.length > 100 ? "..." : "");
        const previewCard = el("div", { style: "border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 10px; font-size: 11px; background: rgba(0,0,0,0.2);" }, [
          el("div", { style: "font-weight: 600; margin-bottom: 4px; color: #b9a9ff;", text: `📋 ${selectedSourceChain.name}` }),
          el("div", { style: "color: #9995a5; margin-bottom: 6px;", text: `${selectedSourceChain.prompts.length} prompts` }),
          el("div", { style: "color: #cfcbd9; white-space: pre-wrap; opacity: 0.8;", text: `Snippet: ${previewSnippet}` })
        ]);
        
        const btn = button("Import Chain", () => {
          const res = ctx.command("IMPORT_CHAIN_FROM_PROJECT", { sourceProjectKey, chainId });
          if (res.ok) {
            const importedChain = ctx.state.chains.find(c => c.name === selectedSourceChain.name && c.prompts.length === selectedSourceChain.prompts.length);
            if (importedChain) {
               ctx.state.ui.lastImportId = importedChain.id;
               ctx.toast(`✅ Imported "${importedChain.name}"`, "success", {
                 onUndo: () => {
                   ctx.command("DELETE_CHAIN", { chainId: importedChain.id });
                   ctx.toast(`↩ Undid import`, "undo");
                 }
               });
            }
          }
          select.value = "";
          previewContainer.innerHTML = "";
          ctx.mutate(() => { ctx.state.settings.activeTab = "stack"; });
        }, "primary");
        
        previewContainer.append(previewCard, el("div", { style: "margin-top: 8px; display: flex; gap: 8px;" }, [btn]));
      }
    });

    importWrap.append(select, previewContainer);
    return importWrap;
  }"""

import re
content = re.sub(r'  function renderCrossProjectImport.*?return importWrap;\n  }', replacement, content, flags=re.DOTALL)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
