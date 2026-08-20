import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

target = """    const mkTechSelect = (label, key, options) => {
      const listId = `aisq-list-${key}`;
      const dl = el("datalist", { id: listId }, options.map(o => el("option", { value: o })));
      const input = el("input", { 
        className: "aisq-input", 
        type: "text", 
        list: listId, 
        placeholder: `Select or type...`,
        value: inferred[key] && inferred[key] !== "None" ? inferred[key] : "" 
      });
      input.addEventListener("input", e => {
        ctx.mutate(() => { ctx.state.ui.specAnswers[key] = e.target.value || "None" });
        ctx.requestRender();
      });
      input.addEventListener("change", e => {
        ctx.mutate(() => { ctx.state.ui.specAnswers[key] = e.target.value || "None" });
        setTimeout(() => ctx.requestRender(), 150);
      });
      return field(label, el("div", { style: "position: relative;" }, [input, dl]));
    };"""

replacement = """    const mkTechSelect = (label, key, options) => {
      const val = inferred[key] || "";
      const isCustom = val === "__custom__" || (val !== "" && val !== "None" && !options.includes(val));
      const displayVal = val === "__custom__" ? "" : val;
      
      const sel = el("select", { className: "aisq-select", style: "width: 100%;" }, [
        el("option", { value: "", text: `-- Select ${label} --` }),
        ...options.map(o => el("option", { value: o, text: o, selected: val === o })),
        el("option", { value: "__custom__", text: "Other (Type...)", selected: isCustom })
      ]);
      
      const customInput = el("input", { 
        className: "aisq-input", 
        type: "text", 
        placeholder: `Type custom ${label.toLowerCase()}...`, 
        value: isCustom ? displayVal : "",
        style: isCustom ? "display: block; width: 100%; margin-top: 6px;" : "display: none;"
      });

      sel.addEventListener("change", e => {
        ctx.mutate(() => { ctx.state.ui.specAnswers[key] = e.target.value; });
        ctx.requestRender();
        if (e.target.value === "__custom__") {
          setTimeout(() => customInput.focus(), 50);
        }
      });

      customInput.addEventListener("input", e => {
        ctx.mutate(() => { ctx.state.ui.specAnswers[key] = e.target.value || "__custom__"; });
        ctx.requestRender();
      });
      
      customInput.addEventListener("change", e => {
        setTimeout(() => ctx.requestRender(), 150);
      });

      return field(label, el("div", {}, [sel, customInput]));
    };"""

content = content.replace(target, replacement)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
print("Patched mkTechSelect")
