with open("src/ui-tabs.js", "r") as f:
    content = f.read()

import re

new_code = r"""  function renderBuild() {
    ctx.state.ui.specAnswers = ctx.state.ui.specAnswers || {};
    ctx.state.ui.draft = ctx.state.ui.draft || "";
    ctx.state.ui.buildView = ctx.state.ui.buildView || "input"; // "input", "wizard_details", "advanced"
    
    // Empty State Check
    if (!(ctx.state.chains || []).length && !ctx.state.ui.draft && ctx.state.ui.buildView === "input") {
      return renderEmptyState();
    }
    
    if (ctx.state.ui.buildView === "wizard_details") {
      return renderWizardDetails();
    }

    const smartInputContainer = el("div", { className: "aisq-section" }, [
      el("p", { className: "aisq-copy", text: "Paste prompts, a ChatGPT link, or describe what you want to build:" }),
      renderSmartInput(),
      renderAdvancedSection()
    ]);
    return smartInputContainer;
  }

  function renderEmptyState() {
    const specApi = globalThis.AISQSpec;
    
    const mkCard = (icon, title, desc, onClick) => el("button", {
      className: "aisq-quickstart-card",
      on: { click: onClick }
    }, [
      el("div", { style: "font-size: 24px; margin-bottom: 8px;", text: icon }),
      el("div", { style: "font-weight: 600; font-size: 14px; margin-bottom: 4px; color: #f5f4fa;", text: title }),
      el("div", { style: "font-size: 11px; color: #a9a6b4; line-height: 1.3;", text: desc })
    ]);

    const cards = el("div", { style: "display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 24px;" }, [
      mkCard("📊", "SaaS Dashboard", "B2B app with multi-tenancy", () => startWizardWithTemplate("saas-dashboard")),
      mkCard("📁", "Portfolio", "Minimalist personal site", () => startWizardWithTemplate("portfolio")),
      mkCard("🛒", "E-Commerce", "Shop with cart & checkout", () => startWizardWithTemplate("e-commerce")),
      mkCard("🤖", "AI Agent", "LLM wrapper or swarm", () => startWizardWithTemplate("ai-agent")),
      mkCard("📱", "Mobile App", "React Native or Flutter app", () => startWizardWithTemplate("mobile-social")),
      mkCard("🎮", "Web Game", "Canvas-based game loop", () => startWizardWithTemplate("web-game"))
    ]);

    const descInput = el("textarea", { 
      className: "aisq-draft", 
      style: "min-height: 60px; margin-bottom: 12px;", 
      placeholder: "e.g. A to-do app with React and Supabase...",
      on: { 
        keydown: (e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
             e.preventDefault();
             startWizardWithDescription(e.target.value);
          }
        }
      }
    });

    const generateBtn = button("✨ Generate Prompt Sequence", () => startWizardWithDescription(descInput.value), "primary");

    return el("div", { className: "aisq-section" }, [
      el("div", { style: "font-size: 16px; font-weight: 600; margin-bottom: 12px;" }, [document.createTextNode("🚀 What are you building?")]),
      cards,
      el("div", { style: "display: flex; align-items: center; gap: 12px; margin-bottom: 24px;" }, [
        el("hr", { style: "flex: 1; border: none; border-top: 1px solid rgba(255,255,255,0.1);" }),
        el("span", { style: "font-size: 11px; color: #888;" }, [document.createTextNode("or describe it")]),
        el("hr", { style: "flex: 1; border: none; border-top: 1px solid rgba(255,255,255,0.1);" })
      ]),
      descInput,
      el("div", { style: "display: flex; gap: 8px; justify-content: space-between; align-items: center;" }, [
        el("div", { style: "display: flex; gap: 8px;" }, [
          button("📋 Paste prompts", () => { ctx.mutate(() => { ctx.state.ui.draft = ""; ctx.state.ui.buildView = "input"; }); ctx.requestRender(); }, "ghost"),
          button("📂 Copy from project", () => { ctx.mutate(() => { ctx.state.ui.buildView = "input"; ctx.state.ui.showAdvanced = true; }); ctx.requestRender(); }, "ghost")
        ]),
        generateBtn
      ])
    ]);
  }

  function startWizardWithTemplate(templateId) {
    const specApi = globalThis.AISQSpec;
    const t = specApi.BUILT_IN_TEMPLATES.find(x => x.id === templateId);
    if (!t) return;
    ctx.mutate(() => {
      ctx.state.ui.specAnswers = JSON.parse(JSON.stringify(t.answers));
      ctx.state.ui.buildView = "wizard_details";
    });
    ctx.requestRender();
  }

  function startWizardWithDescription(desc) {
    if (!desc.trim()) return;
    ctx.mutate(() => {
      ctx.state.ui.specAnswers = { description: desc.trim() };
      ctx.state.ui.buildView = "wizard_details";
    });
    ctx.requestRender();
  }

  function renderSmartInput() {
    let detectType = "empty"; // empty, chatgpt, json, prompts, natural
    const val = ctx.state.ui.draft.trim();
    
    let parsedPrompts = null;

    if (!val) {
      detectType = "empty";
    } else if (/https?:\/\/(www\.)?chatgpt\.com\/share\/[0-9a-fA-F-]+/.test(val) || val.includes("streamController.enqueue")) {
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
                if (res.ok) { ctx.mutate(()=>{ ctx.state.ui.draft = ""; ctx.state.settings.activeTab = "stack"; }); }
             } else if (detectType === "natural") {
                startWizardWithDescription(ctx.state.ui.draft);
             }
          }
        }
      }
    });

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
           const res = importText(ctx.state.ui.draft, ctx.state.ui.splitStrategy);
           if(res.ok) { ctx.mutate(()=>{ ctx.state.ui.draft = ""; ctx.state.settings.activeTab = "stack"; }); }
        }, "primary"),
        button("Add & Run ▶", () => {
           const res = importText(ctx.state.ui.draft, ctx.state.ui.splitStrategy);
           if (res.ok) {
             ctx.mutate(() => { ctx.state.ui.draft = ""; ctx.state.settings.activeTab = "stack"; });
             void ctx.startRunner();
           }
        }, "ghost")
      );
    } else if (detectType === "natural") {
      actionArea.append(
        button("✨ Build with Wizard →", () => startWizardWithDescription(val), "primary")
      );
    } else {
      const specApi = globalThis.AISQSpec;
      const quickStartRow = el("div", { style: "display: flex; overflow-x: auto; gap: 8px; margin-top: 12px; padding-bottom: 8px;" }, 
        specApi.BUILT_IN_TEMPLATES.map(t => el("button", { 
          style: "display: flex; flex-direction: column; align-items: flex-start; padding: 8px; border: 1px solid #ffffff16; border-radius: 6px; background: #1d1c22; min-width: 140px; cursor: pointer; text-align: left; transition: transform 0.15s;",
          on: { click: () => startWizardWithTemplate(t.id) }
        }, [
          el("div", { style: "font-size: 20px; margin-bottom: 4px;", text: t.icon }),
          el("div", { style: "font-weight: 500; font-size: 13px; color: #f5f4fa;", text: t.name }),
          el("div", { style: "font-size: 11px; color: #a9a6b4; margin-top: 2px;", text: t.scale })
        ]))
      );
      actionArea.append(el("div", { style: "width: 100%;" }, [
        el("div", { style: "font-size: 12px; font-weight: 600; color: #a9a6b4;" }, [document.createTextNode("Quick Starts")]),
        quickStartRow
      ]));
    }

    return el("div", { style: "position: relative;" }, [draft, actionArea]);
  }

  function renderAdvancedSection() {
    ctx.state.ui.showAdvanced = ctx.state.ui.showAdvanced || false;
    
    const summary = el("summary", { style: "cursor: pointer; font-weight: 600; font-size: 12px; color: #a9a6b4; outline: none; margin-bottom: 12px;", text: "⚙️ Advanced" });
    summary.addEventListener("click", (e) => {
      e.preventDefault();
      ctx.mutate(() => { ctx.state.ui.showAdvanced = !ctx.state.ui.showAdvanced; });
      ctx.requestRender();
    });

    const details = el("details", { open: ctx.state.ui.showAdvanced, style: "margin-top: 24px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px;" }, [summary]);

    if (ctx.state.ui.showAdvanced) {
      const strategy = el("select", { className: "aisq-select" });
      for (const [value, label] of [["auto", "Detection mode: Auto"], ["stage", "Detection mode: Stage / Phase headings"], ["id", "Detection mode: P001 / R001 IDs"], ["prompt", "Detection mode: Prompt headings"], ["delimiter", "Detection mode: Delimiters"], ["numbered", "Detection mode: Numbered blocks"], ["single", "Detection mode: Single prompt"]]) {
        const option = el("option", { value, text: label });
        if (value === (ctx.state.ui.splitStrategy || "auto")) option.selected = true;
        strategy.append(option);
      }
      strategy.addEventListener("change", () => {
        ctx.state.ui.splitStrategy = strategy.value;
        ctx.requestRender();
      });

      const openWizardBtn = button("✨ Open Full Wizard", () => {
        ctx.mutate(() => { ctx.state.ui.buildView = "wizard_details"; });
        ctx.requestRender();
      }, "ghost");

      details.append(
        field("Detection mode Override", strategy),
        el("div", { style: "margin-top: 12px;" }, [openWizardBtn]),
        renderCrossProjectImport()
      );
    }
    
    return details;
  }

  function renderWizardDetails() {
    const specApi = globalThis.AISQSpec;
    const inferred = specApi.inferDefaults(ctx.state.ui.specAnswers);
    const visible = specApi.getVisibleSections(inferred);
    ctx.state.ui.specAnswers.featureChips = ctx.state.ui.specAnswers.featureChips || [];
    ctx.state.ui.specAnswers.stageOverrides = ctx.state.ui.specAnswers.stageOverrides || {};
    
    const stages = specApi.resolveStages(inferred);
    const overrides = ctx.state.ui.specAnswers.stageOverrides;
    const result = specApi.assembleSpec(ctx.state.ui.specAnswers, overrides);
    
    const stackSummary = [inferred.frontend, inferred.backend, inferred.database].filter(x => x && x !== "None").join(" + ") || "No stack specified";
    
    const previewCard = el("div", { style: "background: rgba(115,87,255,0.1); border: 1px solid rgba(115,87,255,0.3); border-radius: 8px; padding: 12px; margin-bottom: 16px;" }, [
      el("div", { style: "display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;" }, [
        el("div", { style: "font-weight: 600; font-size: 14px; color: #fff;" }, [document.createTextNode(ctx.state.ui.specAnswers.name || "Untitled App")]),
        el("div", { style: "font-size: 11px; color: #b9a9ff; padding: 2px 6px; background: rgba(115,87,255,0.2); border-radius: 4px;" }, [document.createTextNode(inferred.scale)])
      ]),
      el("div", { style: "font-size: 12px; color: #cfcbd9; margin-bottom: 4px;" }, [document.createTextNode(`${result.stageCount} stages · ~${result.charCount.toLocaleString()} chars`)]),
      el("div", { style: "font-size: 11px; color: #9995a5;" }, [document.createTextNode(stackSummary)])
    ]);

    const nameInput = el("input", { className: "aisq-input", value: ctx.state.ui.specAnswers.name || "", placeholder: "My App", on: { input: e => { ctx.state.ui.specAnswers.name = e.target.value; ctx.requestRender(); } } });
    const descInput = el("textarea", { className: "aisq-draft", style: "min-height: 60px;", value: ctx.state.ui.specAnswers.description || "", placeholder: "A to-do app...", on: { input: e => { ctx.state.ui.specAnswers.description = e.target.value; ctx.requestRender(); } } });
    
    const featureText = el("textarea", { className: "aisq-draft", style: "min-height: 80px;", value: ctx.state.ui.specAnswers.features || "", on: { input: e => { ctx.state.ui.specAnswers.features = e.target.value; ctx.requestRender(); } } });
    const suggestions = specApi.FEATURE_SUGGESTIONS[inferred.archetype] || [];
    const suggestionChips = el("div", { style: "display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;" }, suggestions.map(s => {
      const isSelected = ctx.state.ui.specAnswers.featureChips.includes(s);
      return el("button", { text: (isSelected ? "✓ " : "+ ") + s, style: `font-size: 11px; padding: 2px 6px; border: 1px solid #ccc; border-radius: 4px; background: ${isSelected ? '#e0f0ff' : 'transparent'}; color: ${isSelected ? '#000' : '#cfcbd9'}; cursor: pointer;`, on: { click: () => {
        ctx.mutate(() => {
          if (isSelected) {
            ctx.state.ui.specAnswers.featureChips = ctx.state.ui.specAnswers.featureChips.filter(x => x !== s);
          } else {
            ctx.state.ui.specAnswers.featureChips.push(s);
          }
        });
        ctx.requestRender();
      }} });
    }));

    const mkTechSelect = (label, key, options) => {
      const sel = el("select", { className: "aisq-select" }, [el("option", { value: "", text: `-- Select ${label} --` }), ...options.map(o => el("option", { value: o, text: o, selected: inferred[key] === o }))]);
      sel.addEventListener("change", e => { ctx.mutate(() => { ctx.state.ui.specAnswers[key] = e.target.value }); ctx.requestRender(); });
      return field(label, sel);
    };

    let techStackFields = null;
    if (visible.techStack) {
      techStackFields = el("div", { style: "display: grid; grid-template-columns: 1fr 1fr; gap: 8px;" }, [
        mkTechSelect("Frontend", "frontend", ["React", "Vue", "Svelte", "Vanilla JS", "Next.js 14 App Router", "Next.js", "Astro", "React Native", "Angular", "None"]),
        mkTechSelect("Backend", "backend", ["Node.js", "Node.js + Express", "Python", "Python + FastAPI", "Go", "Firebase", "Supabase", "Next.js API Routes", "Node.js + NestJS", "Java Spring Boot", "None"]),
        mkTechSelect("Database", "database", ["PostgreSQL", "PostgreSQL (Supabase)", "PostgreSQL (pgvector)", "MongoDB", "MySQL", "Redis", "Firestore", "None"]),
        mkTechSelect("Hosting", "hosting", ["Vercel", "Netlify", "AWS", "Render", "App Stores", "GitHub Pages"])
      ]);
    }

    const stageCards = stages.map((s, i) => {
      const isEnabled = overrides[s.id] !== undefined ? overrides[s.id] : s.enabled;
      const toggle = el("input", { type: "checkbox", checked: isEnabled, disabled: s.required });
      toggle.addEventListener("change", e => {
        ctx.mutate(() => { ctx.state.ui.specAnswers.stageOverrides[s.id] = e.target.checked; });
        ctx.requestRender();
      });
      const header = el("summary", { style: "cursor: pointer; font-weight: bold; font-size: 13px; display: flex; align-items: center; gap: 8px;" }, [
        toggle,
        el("span", { text: `Stage ${i + 1}: ${s.title}` })
      ]);
      const previewText = s.builder(inferred).trim().substring(0, 150) + "...";
      const body = el("div", { style: "padding: 8px; font-size: 11px; background: rgba(0,0,0,0.2); border-top: 1px solid rgba(255,255,255,0.1); white-space: pre-wrap;", text: previewText });
      return el("details", { style: "border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 4px 8px; margin-bottom: 4px;" }, [header, body]);
    });

    const submit = () => {
      const finalResult = specApi.assembleSpec(ctx.state.ui.specAnswers, overrides);
      const commandResult = importText(finalResult.raw, finalResult.strategy, { name: ctx.state.ui.specAnswers.name || "Generated App", preface: finalResult.preface });
      if (commandResult.ok) {
        ctx.mutate(() => { ctx.state.ui.buildView = "input"; ctx.state.ui.specAnswers = {}; ctx.state.settings.activeTab = "stack"; });
        ctx.requestRender();
      }
    };
    
    const submitAndStart = () => {
      const finalResult = specApi.assembleSpec(ctx.state.ui.specAnswers, overrides);
      const commandResult = importText(finalResult.raw, finalResult.strategy, { name: ctx.state.ui.specAnswers.name || "Generated App", preface: finalResult.preface });
      if (commandResult.ok) {
        ctx.mutate(() => { 
          ctx.state.ui.buildView = "input"; 
          ctx.state.ui.specAnswers = {}; 
          ctx.state.settings.activeTab = "stack";
        });
        void ctx.startRunner();
      }
    };

    return el("div", { className: "aisq-section" }, [
      el("div", { style: "display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;" }, [
        button("← Back", () => { ctx.mutate(() => { ctx.state.ui.buildView = "input"; }); ctx.requestRender(); }, "ghost"),
        el("strong", { text: "App Wizard" })
      ]),
      previewCard,
      field("Name", nameInput),
      field("Description", descInput),
      field("Features", el("div", {}, [featureText, suggestionChips])),
      techStackFields ? field("Tech Stack", techStackFields) : null,
      
      el("details", { style: "margin-top: 16px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 8px;" }, [
        el("summary", { style: "cursor: pointer; font-weight: 600; outline: none;", text: "Review Stages & Text" }),
        el("div", { style: "margin-top: 12px;" }, stageCards),
        el("pre", { style: "white-space: pre-wrap; font-size: 10px; background: rgba(0,0,0,0.3); padding: 8px; max-height: 200px; overflow: auto; margin-top: 12px;", text: result.preface + "\n\n" + result.raw })
      ]),

      el("div", { className: "aisq-actions", style: "margin-top: 16px;" }, [
        button("Add to Queue", submit, "ghost"),
        button("Generate & Run ▶", submitAndStart, "primary")
      ])
    ]);
  }
"""

content = re.sub(r'  function renderBuild\(\) \{.*?(?=  async function loadUserTemplates\(\))', new_code, content, flags=re.DOTALL)

with open("src/ui-tabs.js", "w") as f:
    f.write(content)

