with open("src/ui-tabs.js", "r") as f:
    content = f.read()

content = content.replace("""             if (detectType === "prompts") {
                importText(ctx.state.ui.draft, ctx.state.ui.splitStrategy);
             } else if (detectType === "natural") {""",
"""             if (detectType === "prompts") {
                const res = importText(ctx.state.ui.draft, ctx.state.ui.splitStrategy);
                if (res.ok) {
                    ctx.mutate(()=>{ ctx.state.ui.draft = ""; ctx.state.settings.activeTab = "stack"; });
                }
             } else if (detectType === "natural") {""")

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
