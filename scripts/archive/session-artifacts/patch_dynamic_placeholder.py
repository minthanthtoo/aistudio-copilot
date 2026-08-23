import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

# 1. Remove the old static placeholder logic at the top of renderSmartInput
target_top = """    let placeholderText = "Paste prompts, ChatGPT share URL, JSON template, or app description...";
    const strategy = ctx.state.ui.splitStrategy || "auto";
    if (strategy === "stage") placeholderText = "[Stage 1]\\nFirst prompt...\\n\\n[Stage 2]\\nSecond prompt...";
    else if (strategy === "id") placeholderText = "P001: First prompt...\\nP002: Second prompt...";
    else if (strategy === "prompt") placeholderText = "Prompt 1:\\nFirst prompt...\\n\\nPrompt 2:\\nSecond prompt...";
    else if (strategy === "delimiter") placeholderText = "First prompt...\\n---\\nSecond prompt...\\n***\\nThird prompt...";
    else if (strategy === "numbered") placeholderText = "1. First prompt...\\n2. Second prompt...";
    else if (strategy === "single") placeholderText = "Everything pasted here will become one single giant prompt.";

    const draft = el("textarea", {"""

replacement_top = """    const draft = el("textarea", {"""
content = content.replace(target_top, replacement_top)

# 2. Add placeholder update inside updateSmartUI
target_update = """      currentDetectType = detectType;

      // Update badge"""

replacement_update = """      currentDetectType = detectType;

      // Update placeholder dynamically based on selected strategy
      const strategy = ctx.state.ui.splitStrategy || "auto";
      let placeholderText = "Paste prompts, ChatGPT share URL, JSON template, or app description...";
      if (strategy === "stage") placeholderText = "[Stage 1]\\nFirst prompt...\\n\\n[Stage 2]\\nSecond prompt...";
      else if (strategy === "id") placeholderText = "P001: First prompt...\\nP002: Second prompt...";
      else if (strategy === "prompt") placeholderText = "Prompt 1:\\nFirst prompt...\\n\\nPrompt 2:\\nSecond prompt...";
      else if (strategy === "delimiter") placeholderText = "First prompt...\\n---\\nSecond prompt...\\n***\\nThird prompt...";
      else if (strategy === "numbered") placeholderText = "1. First prompt...\\n2. Second prompt...";
      else if (strategy === "single") placeholderText = "Everything pasted here will become one single giant prompt.";
      draft.placeholder = placeholderText;

      // Update badge"""

content = content.replace(target_update, replacement_update)

# 3. Fix strategySelect change event to call updateSmartUI instead of requestRender
target_select = """    strategySelect.addEventListener("change", () => {
      ctx.mutate(() => { ctx.state.ui.splitStrategy = strategySelect.value; });
      ctx.requestRender();
    });"""

replacement_select = """    strategySelect.addEventListener("change", () => {
      ctx.mutate(() => { ctx.state.ui.splitStrategy = strategySelect.value; });
      updateSmartUI();
    });"""

content = content.replace(target_select, replacement_select)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
print("patched dynamic placeholder")
