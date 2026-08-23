import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

my_templates_code = """
      const myTemplatesContainer = el("div", { style: "display: flex; flex-direction: column; gap: 8px; margin-top: 12px; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px;" });
      myTemplatesContainer.append(el("strong", { text: "My Saved Templates", style: "font-size: 12px; color: #a9a6b4;" }));
      
      const renderMyTemplates = async () => {
        const templates = await loadUserTemplates();
        while (myTemplatesContainer.children.length > 1) {
          myTemplatesContainer.removeChild(myTemplatesContainer.lastChild);
        }
        
        if (templates.length === 0) {
          myTemplatesContainer.appendChild(el("div", { style: "font-size: 11px; color: #666; font-style: italic;", text: "No saved templates yet." }));
        } else {
          templates.forEach(t => {
            const row = el("div", { style: "display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: #2a2930; border: 1px solid rgba(255,255,255,0.1); border-radius: 4px;" }, [
              el("span", { style: "font-size: 12px; font-weight: 500;", text: t.name }),
              el("div", { style: "display: flex; gap: 4px;" }, [
                button("Use", () => {
                  ctx.mutate(() => { 
                    ctx.state.ui.specAnswers = JSON.parse(JSON.stringify(t.answers));
                    ctx.state.ui.buildView = "wizard_details";
                  });
                  ctx.requestRender();
                }, "ghost"),
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
                }, "ghost", "Delete template")
              ])
            ]);
            myTemplatesContainer.appendChild(row);
          });
        }

        const importRow = el("div", { style: "margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;" }, [
          el("div", { style: "font-size: 11px; margin-bottom: 4px;", text: "Import Template (JSON)" }),
          el("input", { type: "file", accept: ".json", style: "font-size: 11px;", on: { change: e => {
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
                ctx.requestRender();
              } else {
                ctx.toast("Invalid template JSON file.", "error");
              }
            };
            reader.readAsText(file);
          }}})
        ]);
        myTemplatesContainer.appendChild(importRow);
      };
      renderMyTemplates();
"""

content = content.replace(
    'renderCrossProjectImport()\n      );',
    my_templates_code + '\n        myTemplatesContainer,\n        renderCrossProjectImport()\n      );'
)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
