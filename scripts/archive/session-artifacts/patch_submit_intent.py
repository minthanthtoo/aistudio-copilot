import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

target = """        ctx.mutate(() => { 
          ctx.state.ui.buildView = "input"; 
          ctx.state.ui.specAnswers = {}; 
          ctx.state.settings.activeTab = "stack";
        });
        void ctx.startRunner();
        ctx.requestRender(true);"""

replacement = """        ctx.mutate(() => { 
          ctx.state.ui.buildView = "input"; 
          ctx.state.ui.specAnswers = {}; 
          ctx.state.settings.activeTab = "stack";
          ctx.state.uiIntent = { action: 'start', scope: 'stack' };
        });
        ctx.requestRender(true);"""

content = content.replace(target, replacement)

target2 = """             ctx.mutate(() => { ctx.state.ui.draft = ""; ctx.state.settings.activeTab = "stack"; });
             void ctx.startRunner();
             ctx.requestRender(true);"""

replacement2 = """             ctx.mutate(() => { ctx.state.ui.draft = ""; ctx.state.settings.activeTab = "stack"; ctx.state.uiIntent = { action: 'start', scope: 'stack' }; });
             ctx.requestRender(true);"""

content = content.replace(target2, replacement2)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
print("Patched startRunner to uiIntent")
