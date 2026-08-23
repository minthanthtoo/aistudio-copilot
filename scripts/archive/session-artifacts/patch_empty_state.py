with open("src/ui-tabs.js", "r") as f:
    content = f.read()

import re

# Remove renderEmptyState entirely and the early return trap
content = re.sub(r'    // Empty State Check.*?return renderEmptyState\(\);\n    \}\n', '', content, flags=re.DOTALL)
content = re.sub(r'  function renderEmptyState\(\) \{.*?function startWizardWithTemplate', '  function startWizardWithTemplate', content, flags=re.DOTALL)

# Now, modify renderSmartInput to show the hero layout when empty and 0 chains
hero_code = """
      const isHero = !(ctx.state.chains || []).length;
      
      const specApi = globalThis.AISQSpec;
      const mkCard = (icon, title, desc, onClick) => el("button", {
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
      }

      actionArea.append(el("div", { style: "width: 100%; margin-top: 12px;" }, [
        el("div", { style: "display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;" }, [
          el("div", { style: `font-size: ${isHero ? '16px' : '12px'}; font-weight: 600; color: ${isHero ? '#f5f4fa' : '#a9a6b4'};` }, [document.createTextNode(isHero ? "🚀 Quick Starts" : "Quick Starts")]),
        ]),
        cardsWrap
      ]));
"""

old_empty_code = r"""      const specApi = globalThis\.AISQSpec;
      const quickStartRow = el\("div", \{ style: "display: flex; overflow-x: auto; gap: 8px; margin-top: 12px; padding-bottom: 8px;" \}, 
        specApi\.BUILT_IN_TEMPLATES\.map\(t => el\("button", \{ 
          style: "display: flex; flex-direction: column; align-items: flex-start; padding: 8px; border: 1px solid #ffffff16; border-radius: 6px; background: #1d1c22; min-width: 140px; cursor: pointer; text-align: left; transition: transform 0\.15s;",
          on: \{ click: \(\) => startWizardWithTemplate\(t\.id\) \}
        \}, \[
          el\("div", \{ style: "font-size: 20px; margin-bottom: 4px;", text: t\.icon \}\),
          el\("div", \{ style: "font-weight: 500; font-size: 13px; color: #f5f4fa;", text: t\.name \}\),
          el\("div", \{ style: "font-size: 11px; color: #a9a6b4; margin-top: 2px;", text: t\.scale \}\)
        \]\)\)
      \);
      actionArea\.append\(el\("div", \{ style: "width: 100%;" \}, \[
        el\("div", \{ style: "font-size: 12px; font-weight: 600; color: #a9a6b4;" \}, \[document\.createTextNode\("Quick Starts"\)\]\),
        quickStartRow
      \]\)\);"""

content = re.sub(old_empty_code, hero_code, content, flags=re.DOTALL)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
