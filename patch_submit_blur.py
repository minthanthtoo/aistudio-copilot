import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

target = """if (document.activeElement?.blur) document.activeElement.blur();"""
replacement = """if (ctx.shadow?.activeElement?.blur) ctx.shadow.activeElement.blur();"""

content = content.replace(target, replacement)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
print("Patched document.activeElement to ctx.shadow.activeElement")
