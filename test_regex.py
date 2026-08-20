import re
with open("src/ui-tabs.js", "r") as f:
    content = f.read()

m = re.search(r'  function renderBuild\(\) \{.*?(?=  function loadUserTemplates\(\))', content, flags=re.DOTALL)
if m:
    print("MATCHED!")
else:
    print("NO MATCH")
