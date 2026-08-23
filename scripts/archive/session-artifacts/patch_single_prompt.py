import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

target = """      } else {
        parsedPrompts = Core.parsePromptPack(val, ctx.state.ui.splitStrategy || "auto");
        if (parsedPrompts.prompts.length > 1) detectType = "prompts";
        else detectType = "natural";
      }"""

replacement = """      } else {
        const strategy = ctx.state.ui.splitStrategy || "auto";
        parsedPrompts = Core.parsePromptPack(val, strategy);
        if (parsedPrompts.prompts.length > 1 || strategy !== "auto") {
          detectType = "prompts";
        } else {
          detectType = "natural";
        }
      }"""

content = content.replace(target, replacement)
with open("src/ui-tabs.js", "w") as f:
    f.write(content)
print("done patching single prompt logic")
