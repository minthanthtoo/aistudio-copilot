import re
with open("src/ui-tabs.js", "r") as f:
    content = f.read()

content = re.sub(r'  function renderWizardScreen0\(specApi\) \{.*?(?=  function chainCard\(chain, index\))', '', content, flags=re.DOTALL)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
