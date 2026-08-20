import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

# 1. Remove from renderAdvancedSection
adv_target = """    if (ctx.state.ui.showAdvanced) {
      details.open = true;

      // 1. Parser Settings
      const strategySelect = el("select", { className: "aisq-select" });
      const strats = [["auto", "Auto-detect"], ["stage", "Stage / Phase headings"], ["id", "P001 / R001 IDs"], ["prompt", "Prompt headings"], ["delimiter", "Delimiters"], ["numbered", "Numbered blocks"], ["single", "Single prompt"]];
      for (const [value, label] of strats) {
        const option = el("option", { value, text: label });
        if (value === (ctx.state.ui.splitStrategy || "auto")) option.selected = true;
        strategySelect.append(option);
      }
      strategySelect.addEventListener("change", () => {
        ctx.mutate(() => { ctx.state.ui.splitStrategy = strategySelect.value; });
        ctx.requestRender();
      });
      
      const parserSection = el("div", { className: "aisq-field", style: "margin-bottom: 24px; padding: 12px; background: rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px;" }, [
        el("strong", { text: "Raw Text Splitter", style: "font-size: 12px; color: #f5f4fa; margin-bottom: 2px;" }),
        el("div", { style: "font-size: 11px; color: #a9a6b4; margin-bottom: 8px; line-height: 1.3;", text: "How should pasted text be divided into separate prompts? Override the auto-detection." }),
        field("Split Strategy", strategySelect)
      ]);

      // 2. Template Manager"""

adv_replacement = """    if (ctx.state.ui.showAdvanced) {
      details.open = true;

      // 2. Template Manager"""

content = content.replace(adv_target, adv_replacement)

# Also remove parserSection from details.append
app_target = """      details.append(
        parserSection,
        myTemplatesContainer,
        dataSection
      );"""
app_replacement = """      details.append(
        myTemplatesContainer,
        dataSection
      );"""
content = content.replace(app_target, app_replacement)


# 2. Add to renderSmartInput
smart_target = """    const badgeContainer = el("div", { style: "position: absolute; right: 12px; bottom: 12px; pointer-events: none;" });
    const inputWrapper = el("div", { style: "position: relative; width: 100%;" }, [draft, badgeContainer]);"""

smart_replacement = """    const badgeContainer = el("div", { style: "position: absolute; right: 12px; bottom: 12px; pointer-events: none;" });
    
    const strategySelect = el("select", { className: "aisq-select", style: "position: absolute; top: 12px; right: 12px; width: auto; max-width: 140px; padding: 2px 20px 2px 6px; font-size: 11px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; color: #cfcbd9; cursor: pointer;", title: "Raw Text Splitter format" });
    const strats = [["auto", "Auto-detect"], ["stage", "Phase headings"], ["id", "P001 IDs"], ["prompt", "Prompt headings"], ["delimiter", "Delimiters"], ["numbered", "Numbered blocks"], ["single", "Single prompt"]];
    for (const [value, label] of strats) {
      const option = el("option", { value, text: label });
      if (value === (ctx.state.ui.splitStrategy || "auto")) option.selected = true;
      strategySelect.append(option);
    }
    strategySelect.addEventListener("change", () => {
      ctx.mutate(() => { ctx.state.ui.splitStrategy = strategySelect.value; });
      ctx.requestRender();
    });

    const inputWrapper = el("div", { style: "position: relative; width: 100%;" }, [draft, badgeContainer, strategySelect]);"""

content = content.replace(smart_target, smart_replacement)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
print("done moving splitter dropdown")
