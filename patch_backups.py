import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

target = """      void renderMyTemplates();

      details.append(parserSection, myTemplatesContainer);
    }
    return details;
  }"""

replacement = """      void renderMyTemplates();

      // 3. Data & Backups
      const dataSection = el("div", { className: "aisq-field", style: "margin-top: 24px; padding: 12px; background: rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px;" }, [
        el("strong", { text: "Data & Backups", style: "font-size: 12px; color: #f5f4fa; margin-bottom: 2px;" }),
        el("div", { style: "font-size: 11px; color: #a9a6b4; margin-bottom: 8px; line-height: 1.3;", text: "Export or restore the entire Copilot state (chains, prompts, settings) for this AI Studio project." })
      ]);
      
      const projectFileInput = el("input", { type: "file", accept: ".json", style: "display: none;", on: { change: e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const parsed = JSON.parse(event.target.result);
            if (!parsed || !parsed.schemaVersion || !parsed.chains) throw new Error("Invalid Copilot project backup file");
            
            if (confirm(`Restore project state?\\n\\nWARNING: This will completely replace your current chains, queues, and runner state for this AI Studio project!\\n\\nImporting: ${parsed.chains.length} chains.`)) {
              ctx.mutate(() => { 
                Object.assign(ctx.state, parsed);
                ctx.state.runner.enabled = false; // ensure it doesn't auto-run on import
              });
              ctx.toast("Project state restored successfully", "success");
            }
          } catch (err) {
            ctx.toast(err.message, "error");
          }
        };
        reader.readAsText(file);
        e.target.value = ""; // reset
      }}});

      dataSection.append(projectFileInput);
      dataSection.append(el("div", { style: "display: flex; gap: 8px;" }, [
        button("⬇️ Backup Project", () => {
          const exportData = JSON.parse(JSON.stringify(ctx.state));
          // Clean up runtime ephemeral state
          exportData.uiIntent = null;
          exportData.runner.ownerTabId = null;
          
          const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `aisq-project-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
          a.click();
          URL.revokeObjectURL(url);
          ctx.toast("Project backup downloaded", "success");
        }, "ghost"),
        button("⬆️ Restore Backup", () => projectFileInput.click(), "ghost")
      ]));

      details.append(parserSection, myTemplatesContainer, dataSection);
    }
    return details;
  }"""

content = content.replace(target, replacement)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
print("patched")
