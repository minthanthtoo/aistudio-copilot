import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

# B1: result.preface undefined
content = content.replace('text: result.preface + "\\n\\n" + result.raw', 'text: (result.preface ? result.preface + "\\n\\n" : "") + result.raw')

# B2: "toggle ctx.panel"
content = content.replace('Alt+Shift+A — toggle ctx.panel', 'Alt+Shift+A — toggle Copilot panel')

# B3: insertAtBottom vs pastePlacement mismatch
content = content.replace('const placement = ctx.state.settings.insertAtBottom ? "bottom" : "after";', 'const placement = ctx.state.settings.pastePlacement === "end" ? "bottom" : "after";')

# B4: replace "stack" with "queue" in user facing text
content = content.replace('"Stored but removed from stack"', '"Stored but removed from queue"')
content = content.replace('"Select a chain from the Stack tab to inspect it."', '"Select a chain from the Queue tab to inspect it."')
content = content.replace('text: `Stack: ${counts.chains}', 'text: `Queue: ${counts.chains}')
content = content.replace('through the editable stack without wrapping."', 'through the editable queue without wrapping."')
content = content.replace('"Continue automatically across the stack"', '"Continue automatically across the queue"')
content = content.replace('"Download ZIP after the whole stack completes"', '"Download ZIP after the whole queue completes"')
content = content.replace('"Alt+Enter — start/resume stack"', '"Alt+Enter — start/resume queue"')

# B5: replace "Preface" with "System Context" in user facing text
content = content.replace('"Intro (No Preface)"', '"Intro (No System Context)"')
content = content.replace('"✂️ Move 1st para to Preface"', '"✂️ Move 1st para to System Context"')

with open("src/ui-tabs.js", "w") as f:
    f.write(content)

