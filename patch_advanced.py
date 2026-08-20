import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

# Find renderAdvancedSection
match = re.search(r'function renderAdvancedSection\(\) \{.*?(?=function renderWizardDetails)', content, re.DOTALL)
if not match:
    print("Could not find renderAdvancedSection")
    exit(1)

old_code = match.group(0)

new_code = '''function renderAdvancedSection() {
    ctx.state.ui.showAdvanced = ctx.state.ui.showAdvanced || false;
    const summary = el("summary", { style: "cursor: pointer; font-weight: 600; font-size: 13px; color: #cfcbd9; outline: none; margin-bottom: 12px;", text: "⚙️ Advanced Settings" });
    summary.addEventListener("click", (e) => {
      e.preventDefault();
      ctx.mutate(() => { ctx.state.ui.showAdvanced = !ctx.state.ui.showAdvanced; });
      ctx.requestRender();
    });

    const details = el("details", { open: ctx.state.ui.showAdvanced, style: "margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.08);" }, [summary]);

    if (ctx.state.ui.showAdvanced) {
      details.open = true;

      // 1. Parser Settings
      const strategySelect = el("select", { className: "aisq-select" });
      const strats = [["auto", "Auto-detect"], ["stage", "Stage / Phase headings"], ["id", "P001 / R001 IDs"], ["prompt", "Prompt headings"], ["delimiter", "Delimiters"], ["numbered", "Numbered blocks"], ["single", "Single prompt"]];
      for (const [value, label] of strats) {
        const option = el("option", { value, text: label });
        if (value === (ctx.state.ui.splitStrategy || "auto")) option.selected = true;
        strategySelect.append(option);
      }
      strategySelect.addEventListener("change", () => {
        ctx.mutate(() => { ctx.state.ui.splitStrategy = strategySelect.value; });
        ctx.requestRender();
      });
      
      const parserSection = el("div", { className: "aisq-field", style: "margin-bottom: 24px; padding: 12px; background: rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px;" }, [
        el("strong", { text: "Parser Configuration", style: "font-size: 12px; color: #a9a6b4; margin-bottom: 4px;" }),
        field("Split Strategy", strategySelect)
      ]);

      // 2. Template Manager
      const myTemplatesContainer = el("div", { className: "aisq-field", style: "padding: 12px; background: rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px;" });
      
      const headerRow = el("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;" }, [
        el("strong", { text: "My Saved Templates", style: "font-size: 12px; color: #a9a6b4;" })
      ]);
      myTemplatesContainer.append(headerRow);
      
      const listContainer = el("div", { style: "display: flex; flex-direction: column; gap: 8px;" });
      myTemplatesContainer.append(listContainer);
      
      const renderMyTemplates = async () => {
        const templates = await loadUserTemplates();
        listContainer.innerHTML = "";
        
        if (templates.length === 0) {
          listContainer.appendChild(el("div", { style: "font-size: 11px; color: #666; font-style: italic; padding: 8px; text-align: center; background: rgba(255,255,255,0.02); border-radius: 6px;", text: "No saved templates yet." }));
        } else {
          templates.forEach(t => {
            const row = el("div", { style: "display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: #222128; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);" }, [
              el("span", { style: "font-size: 12px; font-weight: 500; color: #f5f4fa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;", text: t.name }),
              el("div", { style: "display: flex; gap: 6px;" }, [
                button("Use", () => {
                  ctx.mutate(() => { 
                    ctx.state.ui.specAnswers = JSON.parse(JSON.stringify(t.answers));
                    ctx.state.ui.buildView = "wizard_details";
                  });
                  ctx.requestRender();
                }, "primary"),
                button("Export", () => {
                  const json = globalThis.AISQSpec.serializeTemplate(t.answers);
                  const blob = new Blob([json], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${t.name.replace(/\\s+/g, '-').toLowerCase()}-template.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }, "ghost"),
                button("×", async () => {
                  await deleteUserTemplate(t.id);
                  renderMyTemplates();
                }, "danger", "Delete template")
              ])
            ]);
            listContainer.appendChild(row);
          });
        }
      };

      const fileInput = el("input", { type: "file", accept: ".json", style: "display: none;", on: { change: e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          const parsed = globalThis.AISQSpec.deserializeTemplate(event.target.result);
          if (parsed) {
            ctx.mutate(() => { 
              ctx.state.ui.specAnswers = parsed;
              ctx.state.ui.buildView = "wizard_details";
            });
            ctx.toast("Template imported successfully", "success");
            ctx.requestRender();
          } else {
            ctx.toast("Invalid template JSON file.", "error");
          }
        };
        reader.readAsText(file);
        e.target.value = ""; // reset
      }}});

      const importBtn = button("📥 Import JSON", () => fileInput.click(), "ghost");
      
      const actionsRow = el("div", { style: "display: flex; gap: 8px; margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px;" }, [
        fileInput,
        importBtn,
        button("✨ Open Full Wizard", () => {
          ctx.mutate(() => { ctx.state.ui.buildView = "wizard_details"; });
          ctx.requestRender();
        }, "ghost")
      ]);
      myTemplatesContainer.append(actionsRow);

      void renderMyTemplates();

      details.append(parserSection, myTemplatesContainer);
    }
    return details;
  }

'''

content = content.replace(old_code, new_code)
with open("src/ui-tabs.js", "w") as f:
    f.write(content)

