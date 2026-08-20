with open("src/ui-tabs.js", "r") as f:
    content = f.read()

replacement = """      previewCard,
      (() => {
        const mkSelect = (label, key, options) => {
          const sel = el("select", { className: "aisq-select" }, options.map(o => el("option", { value: o.value, text: o.text, selected: inferred[key] === o.value })));
          sel.addEventListener("change", e => { ctx.mutate(() => { ctx.state.ui.specAnswers[key] = e.target.value }); ctx.requestRender(); });
          return field(label, sel);
        };
        const archOptions = Object.entries(specApi.ARCHETYPES).map(([k, v]) => ({ value: k, text: `${v.emoji} ${v.label}` }));
        const scaleOptions = specApi.SCALES.map(s => ({ value: s, text: s.charAt(0).toUpperCase() + s.slice(1) }));
        return el("div", { style: "display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;" }, [
          mkSelect("App Type", "archetype", archOptions),
          mkSelect("Project Size", "scale", scaleOptions)
        ]);
      })(),
      field("Name", nameInput),"""

content = content.replace('      previewCard,\n      field("Name", nameInput),', replacement)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
