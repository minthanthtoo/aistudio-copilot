import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

target = """    const draft = el("textarea", {
      className: "aisq-draft",
      value: ctx.state.ui.draft,
      placeholder: "Paste prompts, ChatGPT share URL, JSON template, or app description...",
      on: {"""

replacement = """    let placeholderText = "Paste prompts, ChatGPT share URL, JSON template, or app description...";
    const strategy = ctx.state.ui.splitStrategy || "auto";
    if (strategy === "stage") placeholderText = "[Stage 1]\\nFirst prompt...\\n\\n[Stage 2]\\nSecond prompt...";
    else if (strategy === "id") placeholderText = "P001: First prompt...\\nP002: Second prompt...";
    else if (strategy === "prompt") placeholderText = "Prompt 1:\\nFirst prompt...\\n\\nPrompt 2:\\nSecond prompt...";
    else if (strategy === "delimiter") placeholderText = "First prompt...\\n---\\nSecond prompt...\\n***\\nThird prompt...";
    else if (strategy === "numbered") placeholderText = "1. First prompt...\\n2. Second prompt...";
    else if (strategy === "single") placeholderText = "Everything pasted here will become one single giant prompt.";

    const draft = el("textarea", {
      className: "aisq-draft",
      value: ctx.state.ui.draft,
      placeholder: placeholderText,
      on: {"""

content = content.replace(target, replacement)
with open("src/ui-tabs.js", "w") as f:
    f.write(content)
print("done replacing placeholder")
