with open("src/content.js", "r") as f:
    content = f.read()

replacement = """  function handleKeydown(event) {
    if (event.key === "Escape" && rootHost?.contains(event.target)) {
      event.preventDefault();
      mutate(() => {
        if (state.settings.activeTab === "build" && state.ui && state.ui.buildView && state.ui.buildView !== "input") {
          state.ui.buildView = "input";
        } else {
          state.settings.panelOpen = false;
        }
      });
      return;
    }
    if (event.altKey && event.shiftKey && event.code === "KeyA") {"""

content = content.replace('  function handleKeydown(event) {\n    if (event.altKey && event.shiftKey && event.code === "KeyA") {', replacement)

with open("src/content.js", "w") as f:
    f.write(content)
