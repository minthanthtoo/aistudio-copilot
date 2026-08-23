import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

target = """    const draft = el("textarea", {
      className: "aisq-draft",
      value: ctx.state.ui.draft,
      placeholder: placeholderText,"""

replacement = """    const draft = el("textarea", {
      className: "aisq-draft",
      value: ctx.state.ui.draft,"""

content = content.replace(target, replacement)
with open("src/ui-tabs.js", "w") as f:
    f.write(content)
print("fixed reference error")
