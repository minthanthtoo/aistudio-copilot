import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

badge_code = """
    let badge = null;
    if (detectType && detectType !== "empty") {
      const typeLabels = { chatgpt: "ChatGPT URL", json: "JSON Template", prompts: "Prompts", natural: "App Description" };
      badge = el("div", { className: "aisq-detect-badge", text: typeLabels[detectType] });
    }
    const inputWrapper = el("div", { style: "position: relative; width: 100%;" }, [draft, badge].filter(Boolean));
"""

# Replace returning `draft` or appending `draft` with `inputWrapper`
content = content.replace('    let actionArea = el("div", { className: "aisq-actions", style: "margin-top: 8px;" });', badge_code + '\n    let actionArea = el("div", { className: "aisq-actions", style: "margin-top: 8px;" });')
content = content.replace('      return el("div", {}, [draft, actionArea]);', '      return el("div", {}, [inputWrapper, actionArea]);')
content = content.replace('        cardsWrap\n      ]));\n      return el("div", {}, [draft, actionArea]);', '        cardsWrap\n      ]));\n      return el("div", {}, [inputWrapper, actionArea]);')
with open("src/ui-tabs.js", "w") as f:
    f.write(content)

