with open("src/content.js", "r") as f:
    content = f.read()

content = content.replace(
    "    touchState: function(...args) { return touchState(...args); },",
    "    touchState: function(...args) { return touchState(...args); },\n    toast: function(...args) { return toast(...args); },"
)

with open("src/content.js", "w") as f:
    f.write(content)
