import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

# Smart Input keydown
smart_input_replacement = """
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
"""
content = re.sub(r'keydown: \(e\) => \{.*?\}\s*\}', smart_input_replacement.strip() + '\n      }', content, count=1, flags=re.DOTALL)

# Wizard keydown
content = re.sub(
    r'keydown: e => \{ if \(e\.key === "Enter" && \(e\.metaKey \|\| e\.ctrlKey\)\) \{ e\.preventDefault\(\); submitAndStart\(\); \} \}',
    r'keydown: e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (e.shiftKey) submitAndStart(); else submit(); } }',
    content
)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)

