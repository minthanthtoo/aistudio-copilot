with open("src/ui-tabs.js", "r") as f:
    content = f.read()

target = "details.append(parserSection, myTemplatesContainer, dataSection);"
replacement = "details.append(myTemplatesContainer, dataSection);"
content = content.replace(target, replacement)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
print("fixed advanced settings button")
