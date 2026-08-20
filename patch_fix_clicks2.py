import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

target = """      input.addEventListener("change", e => {
        ctx.mutate(() => { ctx.state.ui.specAnswers[key] = e.target.value || "None" });
        ctx.requestRender();
      });"""

replacement = """      input.addEventListener("input", e => {
        ctx.mutate(() => { ctx.state.ui.specAnswers[key] = e.target.value || "None" });
        ctx.requestRender();
      });
      input.addEventListener("change", e => {
        ctx.mutate(() => { ctx.state.ui.specAnswers[key] = e.target.value || "None" });
        setTimeout(() => ctx.requestRender(), 150);
      });"""

content = content.replace(target, replacement)

target2 = """input: e => { ctx.state.ui.specAnswers.name = e.target.value; ctx.requestRender(); } } });"""
replacement2 = """input: e => { ctx.state.ui.specAnswers.name = e.target.value; ctx.requestRender(); }, change: e => { setTimeout(() => ctx.requestRender(), 150); } } });"""
content = content.replace(target2, replacement2)

target3 = """input: e => { ctx.state.ui.specAnswers.description = e.target.value; ctx.requestRender(); } } });"""
replacement3 = """input: e => { ctx.state.ui.specAnswers.description = e.target.value; ctx.requestRender(); }, change: e => { setTimeout(() => ctx.requestRender(), 150); } } });"""
content = content.replace(target3, replacement3)

target4 = """input: e => { ctx.state.ui.specAnswers.features = e.target.value; ctx.requestRender(); } } });"""
replacement4 = """input: e => { ctx.state.ui.specAnswers.features = e.target.value; ctx.requestRender(); }, change: e => { setTimeout(() => ctx.requestRender(), 150); } } });"""
content = content.replace(target4, replacement4)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
print("Patched inputs")
