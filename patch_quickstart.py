import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

old_mkCard_block = """      const mkCard = (icon, title, desc, onClick) => el("button", {
        className: "aisq-quickstart-card",
        style: isHero ? "display: flex; flex-direction: column; align-items: flex-start; padding: 12px; border: 1px solid #ffffff16; border-radius: 11px; background: #1d1c22; cursor: pointer; text-align: left; transition: transform 0.15s;" 
                      : "display: flex; flex-direction: column; align-items: flex-start; padding: 8px; border: 1px solid #ffffff16; border-radius: 6px; background: #1d1c22; min-width: 140px; cursor: pointer; text-align: left; transition: transform 0.15s;",
        on: { click: onClick }
      }, [
        el("div", { style: `font-size: ${isHero ? '24px' : '20px'}; margin-bottom: ${isHero ? '8px' : '4px'};`, text: icon }),
        el("div", { style: `font-weight: ${isHero ? '600' : '500'}; font-size: ${isHero ? '14px' : '13px'}; color: #f5f4fa; margin-bottom: ${isHero ? '4px' : '0'};`, text: title }),
        el("div", { style: `font-size: 11px; color: #a9a6b4; line-height: 1.3; ${isHero ? '' : 'margin-top: 2px;'}`, text: desc })
      ]);

      let cardsWrap;
      if (isHero) {
         cardsWrap = el("div", { style: "display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 16px;" }, [
           mkCard("📊", "SaaS Dashboard", "B2B app with multi-tenancy", () => startWizardWithTemplate("saas-dashboard")),
           mkCard("📁", "Portfolio", "Minimalist personal site", () => startWizardWithTemplate("portfolio")),
           mkCard("🛒", "E-Commerce", "Shop with cart & checkout", () => startWizardWithTemplate("e-commerce")),
           mkCard("🤖", "AI Agent", "LLM wrapper or swarm", () => startWizardWithTemplate("ai-agent")),
           mkCard("📱", "Mobile App", "React Native or Flutter app", () => startWizardWithTemplate("mobile-social")),
           mkCard("🎮", "Web Game", "Canvas-based game loop", () => startWizardWithTemplate("web-game"))
         ]);
      } else {
         cardsWrap = el("div", { style: "display: flex; overflow-x: auto; gap: 8px; padding-bottom: 8px;" }, 
           specApi.BUILT_IN_TEMPLATES.map(t => mkCard(t.icon, t.name, t.scale, () => startWizardWithTemplate(t.id)))
         );
      }"""

new_mkCard_block = """      const mkCard = (icon, title, desc, onClick) => el("button", {
        className: `aisq-quickstart-card ${isHero ? 'hero' : 'mini'}`,
        on: { click: onClick }
      }, [
        el("div", { className: "aisq-quickstart-icon", text: icon }),
        el("div", { className: "aisq-quickstart-title", text: title }),
        el("div", { className: "aisq-quickstart-desc", text: desc })
      ]);

      let cardsWrap;
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
      }"""

content = content.replace(old_mkCard_block, new_mkCard_block)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
