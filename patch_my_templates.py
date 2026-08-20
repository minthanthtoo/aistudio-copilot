import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

target = """      let cardsWrap;
      if (isHero) {
         cardsWrap = el("div", { style: "display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;" }, [
           mkCard("📊", "SaaS Dashboard", "B2B app with multi-tenancy", () => startWizardWithTemplate("saas-dashboard")),
           mkCard("📁", "Portfolio", "Minimalist personal site", () => startWizardWithTemplate("portfolio")),
           mkCard("🛒", "E-Commerce", "Shop with cart & checkout", () => startWizardWithTemplate("e-commerce")),
           mkCard("🤖", "AI Agent", "LLM wrapper or swarm", () => startWizardWithTemplate("ai-chat")),
           mkCard("📱", "Mobile App", "React Native or Flutter app", () => startWizardWithTemplate("mobile-social")),
           mkCard("🎮", "Web Game", "Canvas-based game loop", () => startWizardWithTemplate("game-jam"))
         ]);
      } else {
         cardsWrap = el("div", { style: "display: flex; overflow-x: auto; gap: 10px; padding-bottom: 10px;" }, 
           specApi.BUILT_IN_TEMPLATES.map(t => mkCard(t.icon, t.name, t.scale, () => startWizardWithTemplate(t.id)))
         );
      }

      actionArea.append(el("div", { style: "width: 100%; margin-top: 12px;" }, [
        el("div", { style: "display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;" }, [
          el("div", { style: `font-size: ${isHero ? '16px' : '12px'}; font-weight: 600; color: ${isHero ? '#f5f4fa' : '#a9a6b4'};` }, [document.createTextNode(isHero ? "🚀 Quick Starts" : "Quick Starts")]),
        ]),
        cardsWrap
      ]));"""

replacement = """      let cardsWrap;
      if (isHero) {
         cardsWrap = el("div", { style: "display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;" }, [
           mkCard("📊", "SaaS Dashboard", "B2B app with multi-tenancy", () => startWizardWithTemplate("saas-dashboard")),
           mkCard("📁", "Portfolio", "Minimalist personal site", () => startWizardWithTemplate("portfolio")),
           mkCard("🛒", "E-Commerce", "Shop with cart & checkout", () => startWizardWithTemplate("e-commerce")),
           mkCard("🤖", "AI Agent", "LLM wrapper or swarm", () => startWizardWithTemplate("ai-chat")),
           mkCard("📱", "Mobile App", "React Native or Flutter app", () => startWizardWithTemplate("mobile-social")),
           mkCard("🎮", "Web Game", "Canvas-based game loop", () => startWizardWithTemplate("game-jam"))
         ]);
      } else {
         cardsWrap = el("div", { style: "display: flex; overflow-x: auto; gap: 10px; padding-bottom: 10px;" }, 
           specApi.BUILT_IN_TEMPLATES.map(t => mkCard(t.icon, t.name, t.scale, () => startWizardWithTemplate(t.id)))
         );
      }

      const quickStartsContainer = el("div", { style: "width: 100%; margin-top: 12px;" }, [
        el("div", { style: "display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;" }, [
          el("div", { style: `font-size: ${isHero ? '16px' : '12px'}; font-weight: 600; color: ${isHero ? '#f5f4fa' : '#a9a6b4'};` }, [document.createTextNode(isHero ? "🚀 Quick Starts" : "Quick Starts")]),
        ]),
        cardsWrap
      ]);

      const myTemplatesArea = el("div", { style: "width: 100%; margin-top: 12px; display: none;" });
      
      loadUserTemplates().then(templates => {
        if (templates && templates.length > 0) {
          myTemplatesArea.style.display = "block";
          
          const tWrap = el("div", { style: "display: flex; overflow-x: auto; gap: 10px; padding-bottom: 10px;" }, 
            templates.map(t => mkCard("🌟", t.name, "Custom Template", () => {
              ctx.mutate(() => { 
                ctx.state.ui.specAnswers = JSON.parse(JSON.stringify(t.answers));
                ctx.state.ui.buildView = "wizard_details";
              });
              ctx.requestRender();
            }))
          );

          myTemplatesArea.append(
            el("div", { style: "display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;" }, [
              el("div", { style: `font-size: ${isHero ? '16px' : '12px'}; font-weight: 600; color: ${isHero ? '#f5f4fa' : '#a9a6b4'};` }, [document.createTextNode(isHero ? "🌟 My Templates" : "My Templates")]),
            ]),
            tWrap
          );
        }
      });

      actionArea.append(myTemplatesArea, quickStartsContainer);"""

if target in content:
    content = content.replace(target, replacement)
    with open("src/ui-tabs.js", "w") as f:
        f.write(content)
    print("Patched successfully")
else:
    print("Target not found")
