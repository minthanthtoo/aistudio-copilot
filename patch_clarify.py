import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

target1 = """      const parserSection = el("div", { className: "aisq-field", style: "margin-bottom: 24px; padding: 12px; background: rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px;" }, [
        el("strong", { text: "Parser Configuration", style: "font-size: 12px; color: #a9a6b4; margin-bottom: 4px;" }),
        field("Split Strategy", strategySelect)
      ]);"""

replacement1 = """      const parserSection = el("div", { className: "aisq-field", style: "margin-bottom: 24px; padding: 12px; background: rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px;" }, [
        el("strong", { text: "Raw Text Splitter", style: "font-size: 12px; color: #f5f4fa; margin-bottom: 2px;" }),
        el("div", { style: "font-size: 11px; color: #a9a6b4; margin-bottom: 8px; line-height: 1.3;", text: "How should pasted text be divided into separate prompts? Override the auto-detection." }),
        field("Split Strategy", strategySelect)
      ]);"""

content = content.replace(target1, replacement1)

target2 = """    const result = specApi.assembleSpec(ctx.state.ui.specAnswers, overrides);
    
    const stackSummary = [inferred.frontend, inferred.backend, inferred.database].filter(x => x && x !== "None").join(" + ") || "No stack specified";
    
    const previewCard = el("div", { style: "background: rgba(115,87,255,0.1); border: 1px solid rgba(115,87,255,0.3); border-radius: 8px; padding: 12px; margin-bottom: 16px;" }, [
      el("div", { style: "display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;" }, [
        el("div", { style: "font-weight: 600; font-size: 14px; color: #fff;" }, [document.createTextNode(ctx.state.ui.specAnswers.name || "Untitled App")]),
        el("div", { style: "font-size: 11px; color: #b9a9ff; padding: 2px 6px; background: rgba(115,87,255,0.2); border-radius: 4px;" }, [document.createTextNode(inferred.scale)])
      ]),
      el("div", { style: "font-size: 12px; color: #cfcbd9; margin-bottom: 4px;" }, [document.createTextNode(`${result.stageCount} stages · ~${result.charCount.toLocaleString()} chars`)]),
      el("div", { style: "font-size: 11px; color: #9995a5;" }, [document.createTextNode(stackSummary)])
    ]);"""

replacement2 = """    const result = specApi.assembleSpec(ctx.state.ui.specAnswers, overrides);
    
    const parsed = Core.parsePromptPack(result.raw, result.strategy);
    const promptCount = parsed.prompts.length;

    const stackSummary = [inferred.frontend, inferred.backend, inferred.database].filter(x => x && x !== "None").join(" + ") || "No stack specified";
    
    const previewCard = el("div", { style: "background: rgba(115,87,255,0.1); border: 1px solid rgba(115,87,255,0.3); border-radius: 8px; padding: 12px; margin-bottom: 16px;" }, [
      el("div", { style: "display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;" }, [
        el("div", { style: "font-weight: 600; font-size: 14px; color: #fff;" }, [document.createTextNode(ctx.state.ui.specAnswers.name || "Untitled App")]),
        el("div", { style: "display: flex; gap: 6px;" }, [
          el("div", { style: "font-size: 11px; font-weight: 500; color: #4ee09a; padding: 2px 6px; background: rgba(78,224,154,0.15); border-radius: 4px;" }, [document.createTextNode(`${promptCount} Prompt${promptCount === 1 ? '' : 's'}`)]),
          el("div", { style: "font-size: 11px; color: #b9a9ff; padding: 2px 6px; background: rgba(115,87,255,0.2); border-radius: 4px;" }, [document.createTextNode(inferred.scale)])
        ])
      ]),
      el("div", { style: "font-size: 12px; color: #cfcbd9; margin-bottom: 4px;" }, [document.createTextNode(`${result.stageCount} stages · ~${result.charCount.toLocaleString()} chars`)]),
      el("div", { style: "font-size: 11px; color: #9995a5;" }, [document.createTextNode(stackSummary)])
    ]);"""

content = content.replace(target2, replacement2)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)

