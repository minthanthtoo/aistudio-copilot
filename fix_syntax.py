import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

bad_code = """
        keydown: (e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
             e.preventDefault();
             if (detectType === "prompts") {
                const res = importText(ctx.state.ui.draft, ctx.state.ui.splitStrategy);
                if (res.ok) { 
                  ctx.mutate(()=>{ ctx.state.ui.draft = ""; ctx.state.settings.activeTab = "stack"; }); 
                  if (e.shiftKey) void ctx.startRunner();
                }
             } else if (detectType === "natural") {
                startWizardWithDescription(val);
             }
          }
        }
      } else if (detectType === "natural") {
                startWizardWithDescription(ctx.state.ui.draft);
             }
          }
        }
      }
    });
"""

good_code = """
        keydown: (e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
             e.preventDefault();
             if (detectType === "prompts") {
                const res = importText(ctx.state.ui.draft, ctx.state.ui.splitStrategy);
                if (res.ok) { 
                  ctx.mutate(()=>{ ctx.state.ui.draft = ""; ctx.state.settings.activeTab = "stack"; }); 
                  if (e.shiftKey) void ctx.startRunner();
                }
             } else if (detectType === "natural") {
                startWizardWithDescription(val);
             }
          }
        }
      }
    });
"""

content = content.replace(bad_code.strip(), good_code.strip())

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
