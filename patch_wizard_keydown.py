with open("src/ui-tabs.js", "r") as f:
    content = f.read()

# Instead of regex, let's just do a string replace on those specific lines!
content = content.replace(
    'const nameInput = el("input", { className: "aisq-input", value: ctx.state.ui.specAnswers.name || "", placeholder: "My App", on: { input: e => { ctx.state.ui.specAnswers.name = e.target.value; ctx.requestRender(); } } });',
    'const nameInput = el("input", { className: "aisq-input", value: ctx.state.ui.specAnswers.name || "", placeholder: "My App", on: { keydown: e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitAndStart(); } }, input: e => { ctx.state.ui.specAnswers.name = e.target.value; ctx.requestRender(); } } });'
)

content = content.replace(
    'const descInput = el("textarea", { className: "aisq-draft", style: "min-height: 60px;", value: ctx.state.ui.specAnswers.description || "", placeholder: "A to-do app...", on: { input: e => { ctx.state.ui.specAnswers.description = e.target.value; ctx.requestRender(); } } });',
    'const descInput = el("textarea", { className: "aisq-draft", style: "min-height: 60px;", value: ctx.state.ui.specAnswers.description || "", placeholder: "A to-do app...", on: { keydown: e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitAndStart(); } }, input: e => { ctx.state.ui.specAnswers.description = e.target.value; ctx.requestRender(); } } });'
)

content = content.replace(
    'const featureText = el("textarea", { className: "aisq-draft", style: "min-height: 80px;", value: ctx.state.ui.specAnswers.features || "", on: { input: e => { ctx.state.ui.specAnswers.features = e.target.value; ctx.requestRender(); } } });',
    'const featureText = el("textarea", { className: "aisq-draft", style: "min-height: 80px;", value: ctx.state.ui.specAnswers.features || "", on: { keydown: e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitAndStart(); } }, input: e => { ctx.state.ui.specAnswers.features = e.target.value; ctx.requestRender(); } } });'
)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
