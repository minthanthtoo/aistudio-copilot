import re

with open("src/ui-tabs.js", "r") as f:
    content = f.read()

target = """  function renderSmartInput() {
    let detectType = "empty"; // empty, chatgpt, json, prompts, natural
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
      if (parsedPrompts.prompts.length > 1) {
        detectType = "prompts";
      } else {
        detectType = "natural";
      }
    }

    const draft = el("textarea", {
      className: "aisq-draft",
      value: ctx.state.ui.draft,
      placeholder: "Paste prompts, ChatGPT share URL, JSON template, or app description...",
      on: {
        input: (e) => {
          ctx.state.ui.draft = e.target.value;
          ctx.requestRender();
        },
        keydown: (e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
             e.preventDefault();
             if (detectType === "prompts") {
                const res = importText(ctx.state.ui.draft, ctx.state.ui.splitStrategy);
                if (res.ok) { 
                  ctx.mutate(()=>{ ctx.state.ui.draft = ""; ctx.state.settings.activeTab = "stack"; }); 
                  if (e.shiftKey) void ctx.startRunner();
                }
             } else if (detectType === "natural") {
                startWizardWithDescription(val);
             }
          }
        }
      }
    });


    let badge = null;
    if (detectType && detectType !== "empty") {
      const typeLabels = { chatgpt: "ChatGPT URL", json: "JSON Template", prompts: "Prompts", natural: "App Description" };
      badge = el("div", { className: "aisq-detect-badge", text: typeLabels[detectType] });
    }
    const inputWrapper = el("div", { style: "position: relative; width: 100%;" }, [draft, badge].filter(Boolean));

    let actionArea = el("div", { className: "aisq-actions", style: "margin-top: 8px;" });
    
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
            ctx.requestRender();
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
           ctx.requestRender();
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
    } else {

      const isHero = !(ctx.state.chains || []).length;"""

replacement = """  function renderSmartInput() {
    let actionArea = el("div", { className: "aisq-actions", style: "margin-top: 8px; min-height: 32px;" });
    let badgeContainer = el("div", { style: "position: absolute; right: 12px; bottom: 12px; pointer-events: none;" });
    
    let currentDetectType = "empty";

    const draft = el("textarea", {
      className: "aisq-draft",
      value: ctx.state.ui.draft,
      placeholder: "Paste prompts, ChatGPT share URL, JSON template, or app description...",
      on: {
        input: (e) => {
          ctx.state.ui.draft = e.target.value;
          ctx.requestRender(); // will be ignored if focused
          updateSmartUI(); // directly update DOM
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

    const inputWrapper = el("div", { style: "position: relative; width: 100%;" }, [draft, badgeContainer]);
    
    const quickStartsArea = el("div", {});

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
        if (parsedPrompts.prompts.length > 1) {
          detectType = "prompts";
        } else {
          detectType = "natural";
        }
      }
      
      currentDetectType = detectType;

      // Update badge
      badgeContainer.innerHTML = "";
      if (detectType && detectType !== "empty") {
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
      
      // Toggle QuickStarts
      if (detectType === "empty") {
        quickStartsArea.style.display = "block";
      } else {
        quickStartsArea.style.display = "none";
      }
    }

    const isHero = !(ctx.state.chains || []).length;"""

content = content.replace(target, replacement)
with open("src/ui-tabs.js", "w") as f:
    f.write(content)
print("done replacing smart input logic")
