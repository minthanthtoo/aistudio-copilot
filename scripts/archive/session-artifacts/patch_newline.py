with open("src/ui-tabs.js", "r") as f:
    content = f.read()

import re
content = re.sub(r'el\("pre", \{ style: "white-space: pre-wrap; font-size: 10px; background: rgba\(0,0,0,0\.3\); padding: 8px; max-height: 200px; overflow: auto; margin-top: 12px;", text: result\.preface \+ "\n\n" \+ result\.raw \}\)', 'el("pre", { style: "white-space: pre-wrap; font-size: 10px; background: rgba(0,0,0,0.3); padding: 8px; max-height: 200px; overflow: auto; margin-top: 12px;", text: result.preface + "\\\\n\\\\n" + result.raw })', content)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
