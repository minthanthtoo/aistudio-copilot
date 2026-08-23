import re

with open("src/core.js", "r") as f:
    content = f.read()

target = """        get() {
          const key = getCurrentPageKey();
          if (!this.projects[key]) this.projects[key] = defaultProject();
          return this.projects[key][prop];
        },"""

replacement = """        get() {
          const key = getCurrentPageKey();
          if (!this.projects[key]) this.projects[key] = defaultProject();
          if (this.projects[key][prop] === undefined) this.projects[key][prop] = defaultProject()[prop];
          return this.projects[key][prop];
        },"""

content = content.replace(target, replacement)
with open("src/core.js", "w") as f:
    f.write(content)
print("patched core getters")
