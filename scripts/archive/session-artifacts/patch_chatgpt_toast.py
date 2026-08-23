with open("src/ui-tabs.js", "r") as f:
    content = f.read()

replacement = """          ctx.mutate(() => {
            ctx.state.ui.importResult = { conversation, specAnswers };
            ctx.state.ui.importState = "success";
            ctx.state.ui.specAnswers = specAnswers; // prefill wizard
            ctx.toast(`✅ Extracted ${conversation.visibleMessages.length} messages`, "success");
          });"""

content = content.replace("""          ctx.mutate(() => {
            ctx.state.ui.importResult = { conversation, specAnswers };
            ctx.state.ui.importState = "success";
            ctx.state.ui.specAnswers = specAnswers; // prefill wizard
          });""", replacement)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
