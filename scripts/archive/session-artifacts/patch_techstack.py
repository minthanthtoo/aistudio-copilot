import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

target = """    const mkTechSelect = (label, key, options) => {
      const sel = el("select", { className: "aisq-select" }, [el("option", { value: "", text: `-- Select ${label} --` }), ...options.map(o => el("option", { value: o, text: o, selected: inferred[key] === o }))]);
      sel.addEventListener("change", e => { ctx.mutate(() => { ctx.state.ui.specAnswers[key] = e.target.value }); ctx.requestRender(); });
      return field(label, sel);
    };"""

replacement = """    const mkTechSelect = (label, key, options) => {
      const listId = `aisq-list-${key}`;
      const dl = el("datalist", { id: listId }, options.map(o => el("option", { value: o })));
      const input = el("input", { 
        className: "aisq-input", 
        type: "text", 
        list: listId, 
        placeholder: `Select or type...`,
        value: inferred[key] && inferred[key] !== "None" ? inferred[key] : "" 
      });
      input.addEventListener("change", e => {
        ctx.mutate(() => { ctx.state.ui.specAnswers[key] = e.target.value || "None" });
        ctx.requestRender();
      });
      return field(label, el("div", { style: "position: relative;" }, [input, dl]));
    };"""

content = content.replace(target, replacement)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
