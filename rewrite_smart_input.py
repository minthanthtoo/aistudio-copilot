import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

# Replace from `function renderSmartInput() {` to `return el("div", { style: "position: relative;" }, [inputWrapper, actionArea]);\n  }`

start_idx = content.find("function renderSmartInput() {")
end_idx = content.find("return el(\"div\", { style: \"position: relative;\" }, [inputWrapper, actionArea]);\n  }") + len("return el(\"div\", { style: \"position: relative;\" }, [inputWrapper, actionArea]);\n  }")

replacement = """  function renderSmartInput() {
    let currentDetectType = "empty";
    
    const draft = el("textarea", {
      className: "aisq-draft",
      value: ctx.state.ui.draft,
      placeholder: "Paste prompts, ChatGPT share URL, JSON template, or app description...",
      on: {
        input: (e) => {
          ctx.state.ui.draft = e.target.value;
          ctx.requestRender(); // Queues render (aborted by focus guard)
          updateSmartUI(); // Force update buttons while typing
        },
        keydown: (e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
             e.preventDefault();
             const val = ctx.state.ui.draft.trim();
             if (currentDetectType === "prompts") {
                const res = importText(ctx.state.ui.draft, ctx.state.ui.splitStrategy);
                if (res.ok) { 
                  ctx.mutate(()=>{ ctx.state.ui.draft = ""; ctx.state.settings.activeTab = "stack"; }); 
                  if (e.shiftKey) { ctx.mutate(()=>{ ctx.state.uiIntent = { action: 'start', scope: 'stack' }; }); }
                  ctx.requestRender(true);
                }
             } else if (currentDetectType === "natural") {
                startWizardWithDescription(val);
             }
          }
        }
      }
    });

    const badgeContainer = el("div", { style: "position: absolute; right: 12px; bottom: 12px; pointer-events: none;" });
    const inputWrapper = el("div", { style: "position: relative; width: 100%;" }, [draft, badgeContainer]);
    
    const actionArea = el("div", { className: "aisq-actions", style: "margin-top: 8px; min-height: 32px;" });
    const templatesArea = el("div", { style: "width: 100%; margin-top: 12px; display: none;" });
    const quickStartsArea = el("div", { style: "width: 100%; margin-top: 12px; display: none;" });
    const extraContentArea = el("div", {}, [templatesArea, quickStartsArea]);

    function updateSmartUI() {
      let detectType = "empty";
      const val = ctx.state.ui.draft.trim();
      let parsedPrompts = null;

      if (!val) {
        detectType = "empty";
      } else if (/https?:\\/\\/(www\\.)?chatgpt\\.com\\/share\\/[0-9a-fA-F-]+/.test(val) || val.includes("streamController.enqueue")) {
        detectType = "chatgpt";
      } else if (val.startsWith("{") && val.endsWith("}")) {
        try { JSON.parse(val); detectType = "json"; } catch(e) { detectType = "natural"; }
      } else {
        parsedPrompts = Core.parsePromptPack(val, ctx.state.ui.splitStrategy || "auto");
        if (parsedPrompts.prompts.length > 1) detectType = "prompts";
        else detectType = "natural";
      }
      
      currentDetectType = detectType;

      // Update badge
      badgeContainer.innerHTML = "";
      if (detectType !== "empty") {
        const typeLabels = { chatgpt: "ChatGPT URL", json: "JSON Template", prompts: "Prompts", natural: "App Description" };
        badgeContainer.append(el("div", { className: "aisq-detect-badge", text: typeLabels[detectType] }));
      }

      // Update actionArea
      actionArea.innerHTML = "";
      if (detectType === "chatgpt") {
        actionArea.append(button("Fetch & Analyze ChatGPT Link", async () => {
           const source = val;
           ctx.toast("Fetching conversation data...", "info");
           try {
              let rawHtml = source;
              if (source.startsWith("http")) {
                const res = await chrome.runtime.sendMessage({ type: "AISQ_FETCH_URL", url: source });
                if (!res.ok) throw new Error(res.error || "Failed to fetch URL.");
                rawHtml = res.html;
              }
              const extractorApi = globalThis.AISQChatGPTExtractor;
              const conversation = extractorApi.extractConversation(rawHtml, source);
              const specAnswers = extractorApi.analyzeTranscript(conversation);
              ctx.mutate(() => {
                ctx.state.ui.draft = "";
                ctx.state.ui.specAnswers = specAnswers;
                ctx.state.ui.buildView = "wizard_details";
                ctx.toast(`✅ Extracted ${conversation.visibleMessages.length} messages`, "success");
              });
              ctx.requestRender(true);
           } catch(e) {
              ctx.toast(`Error: ${e.message}`, "error");
           }
        }, "primary"));
      } else if (detectType === "json") {
        actionArea.append(button("Load as Template", () => {
           const specApi = globalThis.AISQSpec;
           const parsed = specApi.deserializeTemplate(val);
           if (parsed) {
             ctx.mutate(() => { 
               ctx.state.ui.specAnswers = parsed;
               ctx.state.ui.draft = "";
               ctx.state.ui.buildView = "wizard_details";
               ctx.toast("✅ Template loaded", "success");
             });
             ctx.requestRender(true);
           } else {
             ctx.toast("Invalid template JSON.", "error");
           }
        }, "primary"));
      } else if (detectType === "prompts") {
        actionArea.append(
          el("div", { className: "aisq-meter", text: `${parsedPrompts.prompts.length} prompt(s) detected via ${parsedPrompts.strategy}` }),
          button("Add to Queue", () => {
             if (ctx.shadow?.activeElement?.blur) ctx.shadow.activeElement.blur();
             const res = importText(ctx.state.ui.draft, ctx.state.ui.splitStrategy);
             if(res.ok) { ctx.mutate(()=>{ ctx.state.ui.draft = ""; ctx.state.settings.activeTab = "stack"; }); ctx.requestRender(true); }
          }, "primary"),
          button("Add & Run ▶", () => {
             if (ctx.shadow?.activeElement?.blur) ctx.shadow.activeElement.blur();
             const res = importText(ctx.state.ui.draft, ctx.state.ui.splitStrategy);
             if (res.ok) {
               ctx.mutate(() => { ctx.state.ui.draft = ""; ctx.state.settings.activeTab = "stack"; ctx.state.uiIntent = { action: 'start', scope: 'stack' }; });
               ctx.requestRender(true);
             }
          }, "ghost")
        );
      } else if (detectType === "natural") {
        actionArea.append(
          button("✨ Build with Wizard →", () => startWizardWithDescription(val), "primary")
        );
      }

      // Show extra content only if empty
      extraContentArea.style.display = (detectType === "empty") ? "block" : "none";
    }

    // Initialize extra content exactly once
    const isHero = !(ctx.state.chains || []).length;
    const specApi = globalThis.AISQSpec;
    const mkCard = (icon, title, desc, onClick) => el("button", {
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
    }
    
    quickStartsArea.append(
      el("div", { style: "display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;" }, [
        el("div", { style: `font-size: ${isHero ? '16px' : '12px'}; font-weight: 600; color: ${isHero ? '#f5f4fa' : '#a9a6b4'};` }, [document.createTextNode(isHero ? "🚀 Quick Starts" : "Quick Starts")]),
      ]),
      cardsWrap
    );
    quickStartsArea.style.display = "block"; // visible by default

    loadUserTemplates().then(templates => {
      if (templates && templates.length > 0) {
        templatesArea.style.display = "block";
        const tWrap = el("div", { style: "display: flex; overflow-x: auto; gap: 10px; padding-bottom: 10px;" }, 
          templates.map(t => mkCard("🌟", t.name, "Custom Template", () => {
            ctx.mutate(() => { 
              ctx.state.ui.specAnswers = JSON.parse(JSON.stringify(t.answers));
              ctx.state.ui.buildView = "wizard_details";
            });
            ctx.requestRender(true);
          }))
        );
        templatesArea.append(
          el("div", { style: "display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;" }, [
            el("div", { style: `font-size: ${isHero ? '16px' : '12px'}; font-weight: 600; color: ${isHero ? '#f5f4fa' : '#a9a6b4'};` }, [document.createTextNode(isHero ? "🌟 My Templates" : "My Templates")]),
          ]),
          tWrap
        );
      }
    });

    updateSmartUI(); // initial evaluation
    return el("div", { style: "position: relative;" }, [inputWrapper, actionArea, extraContentArea]);
  }"""

content = content[:start_idx] + replacement + content[end_idx:]

with open("src/ui-tabs.js", "w") as f:
    f.write(content)
print("Finished complete rewrite of renderSmartInput")
