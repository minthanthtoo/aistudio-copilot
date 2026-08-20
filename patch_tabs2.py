import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

target = """    const stackSummary = [inferred.frontend, inferred.backend, inferred.database].filter(x => x && x !== "None").join(" + ") || "No stack specified";"""
replacement = """    const stackSummary = [inferred.frontend, inferred.backend, inferred.database].filter(x => x && x !== "None" && x !== "__custom__").join(" + ") || "No stack specified";"""

content = content.replace(target, replacement)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
