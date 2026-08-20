(function initAISQUI(global) {
  "use strict";
  const Core = global.AISQCore;
  const ctx = global.AISQContext;
  const PHASES = Core.PHASES;
  
  function el(tag, options = {}, children = []) {
    const node = document.createElement(tag);
    if (options.className) node.className = options.className;
    if (options.text !== undefined) node.textContent = String(options.text);
    if (options.html !== undefined) node.innerHTML = String(options.html);
    if (options.title) node.title = options.title;
    if (options.type) node.type = options.type;
    if (options.value !== undefined) node.value = String(options.value);
    if (options.placeholder) node.placeholder = options.placeholder;
    if (options.checked !== undefined) node.checked = !!options.checked;
    if (options.disabled !== undefined) node.disabled = !!options.disabled;
    if (options.role) node.setAttribute("role", options.role);
    if (options.ariaLabel) node.setAttribute("aria-label", options.ariaLabel);
    if (options.ariaSelected !== undefined) node.setAttribute("aria-selected", String(!!options.ariaSelected));
    if (options.attrs) for (const [name, value] of Object.entries(options.attrs)) if (value !== undefined && value !== null) node.setAttribute(name, String(value));
    if (options.on) for (const [event, handler] of Object.entries(options.on)) node.addEventListener(event, handler);
    for (const child of Array.isArray(children) ? children : [children]) if (child) node.append(child);
    return node;
  }

  function button(label, handler, kind = "", accessibleLabel = label) {
    return el("button", { className: `aisq-button ${kind}`.trim(), type: "button", text: label, title: accessibleLabel, ariaLabel: accessibleLabel, on: { click: handler } });
  }

  function field(label, control, help = "") {
    const wrap = el("label", { className: "aisq-field", title: label }, [el("span", { className: "aisq-label", text: label }), control]);
    if (help) wrap.append(el("span", { className: "aisq-help", text: help }));
    return wrap;
  }

  function importText(raw, strategy = ctx.state.ui.splitStrategy, options = {}) {
    const parsed = Core.parsePromptPack(raw, strategy);
    if (!parsed.prompts.length) {
      alert("No prompts found.");
      return { ok: false };
    }
    const chain = Core.makeChain({ name: options.name || "Imported Chain" });
    if (options.preface) chain.preface = options.preface;
    chain.prompts = parsed.prompts.map(p => Core.makePrompt(p));
    
    const placement = ctx.state.settings.insertAtBottom ? "bottom" : "after";
    const commandResult = ctx.command("IMPORT_CHAIN", { chain, placement, afterChainId: options.afterChainId || (placement === "after" ? ctx.state.selectedChainId : null) }, { history: { kind: "chain_imported", message: `Added ${chain.name} with ${parsed.prompts.length} prompt(s)`, data: { chainId: chain.id, strategy: parsed.strategy } } });
    
    if (commandResult.ok) {
      ctx.state.ui.lastImportId = chain.id;
      ctx.toast(`✅ Added "${chain.name}" (${parsed.prompts.length} prompts)`, "success", {
        onUndo: () => {
          ctx.command("DELETE_CHAIN", { chainId: chain.id }, { history: { kind: "undo_import", message: `Undo import of ${chain.name}` } });
          ctx.toast(`↩ Undid import of "${chain.name}"`, "undo");
        }
      });
      ctx.requestRender();
    }
    return commandResult;
  }

  
  function renderCrossProjectImport() {
    const otherProjects = Core.getAllProjects(ctx.state).filter(p => p.key !== Core.getCurrentPageKey() && p.chains?.length);
    
    const importWrap = el("div", { style: "margin-top: 16px; padding: 12px; background: rgba(115, 87, 255, 0.05); border: 1px dashed rgba(115, 87, 255, 0.3); border-radius: 8px; display: flex; flex-direction: column; gap: 8px;" }, [
      el("strong", { text: "Import chains from another project", style: "font-size: 12px; color: #a78bfa;" })
    ]);
    
    if (!otherProjects.length) {
      importWrap.append(el("div", { style: "font-size: 11px; color: #666;", text: "No other populated projects found in this browser." }));
      return importWrap;
    }

    const select = el("select", { className: "aisq-select" }, [el("option", { text: "-- Select a chain to copy --", value: "" })]);
    const previewContainer = el("div", { style: "margin-top: 8px;" });

    for (const p of otherProjects) {
      const group = el("optgroup", { label: `App: ${p.key}` });
      for (const c of p.chains) group.append(el("option", { value: `${p.key}|${c.id}`, text: `${c.name} (${c.prompts.length} prompts)` }));
      select.append(group);
    }
    
    let selectedSourceChain = null;
    let selectedProjectKey = null;

    select.addEventListener("change", (e) => {
      previewContainer.innerHTML = "";
      if (!e.target.value) {
        selectedSourceChain = null;
        selectedProjectKey = null;
        ctx.requestRender();
        return;
      }
      const [sourceProjectKey, chainId] = e.target.value.split("|");
      selectedProjectKey = sourceProjectKey;
      const sourceProject = otherProjects.find(p => p.key === sourceProjectKey);
      selectedSourceChain = sourceProject?.chains.find(c => c.id === chainId);
      
      if (selectedSourceChain) {
        const previewText = selectedSourceChain.preface || (selectedSourceChain.prompts[0] ? selectedSourceChain.prompts[0].text : "Empty chain");
        const previewSnippet = previewText.substring(0, 100) + (previewText.length > 100 ? "..." : "");
        const previewCard = el("div", { style: "border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 10px; font-size: 11px; background: rgba(0,0,0,0.2);" }, [
          el("div", { style: "font-weight: 600; margin-bottom: 4px; color: #b9a9ff;", text: `📋 ${selectedSourceChain.name}` }),
          el("div", { style: "color: #9995a5; margin-bottom: 6px;", text: `${selectedSourceChain.prompts.length} prompts` }),
          el("div", { style: "color: #cfcbd9; white-space: pre-wrap; opacity: 0.8;", text: `Snippet: ${previewSnippet}` })
        ]);
        
        const btn = button("Import Chain", () => {
          const res = ctx.command("IMPORT_CHAIN_FROM_PROJECT", { sourceProjectKey, chainId });
          if (res.ok) {
            const importedChain = ctx.state.chains.find(c => c.name === selectedSourceChain.name && c.prompts.length === selectedSourceChain.prompts.length);
            if (importedChain) {
               ctx.state.ui.lastImportId = importedChain.id;
               ctx.toast(`✅ Imported "${importedChain.name}"`, "success", {
                 onUndo: () => {
                   ctx.command("DELETE_CHAIN", { chainId: importedChain.id });
                   ctx.toast(`↩ Undid import`, "undo");
                 }
               });
            }
          }
          select.value = "";
          previewContainer.innerHTML = "";
          ctx.mutate(() => { ctx.state.settings.activeTab = "stack"; });
        }, "primary");
        
        previewContainer.append(previewCard, el("div", { style: "margin-top: 8px; display: flex; gap: 8px;" }, [btn]));
      }
    });

    importWrap.append(select, previewContainer);
    return importWrap;
  }


  function renderBuild() {
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

    const nameInput = el("input", { className: "aisq-input", value: ctx.state.ui.specAnswers.name || "", placeholder: "My App", on: { keydown: e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitAndStart(); } }, input: e => { ctx.state.ui.specAnswers.name = e.target.value; ctx.requestRender(); } } });
    const descInput = el("textarea", { className: "aisq-draft", style: "min-height: 60px;", value: ctx.state.ui.specAnswers.description || "", placeholder: "A to-do app...", on: { keydown: e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitAndStart(); } }, input: e => { ctx.state.ui.specAnswers.description = e.target.value; ctx.requestRender(); } } });
    
    const featureText = el("textarea", { className: "aisq-draft", style: "min-height: 80px;", value: ctx.state.ui.specAnswers.features || "", on: { keydown: e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitAndStart(); } }, input: e => { ctx.state.ui.specAnswers.features = e.target.value; ctx.requestRender(); } } });
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
        el("pre", { style: "white-space: pre-wrap; font-size: 10px; background: rgba(0,0,0,0.3); padding: 8px; max-height: 200px; overflow: auto; margin-top: 12px;", text: result.preface + "

" + result.raw })
      ]),

      el("div", { className: "aisq-actions", style: "margin-top: 16px;" }, [
        button("Add to Queue", submit, "ghost"),
        button("Generate & Run ▶", submitAndStart, "primary")
      ])
    ]);
  }
  async function loadUserTemplates() {
    return new Promise(resolve => {
      chrome.storage.local.get("aisqTemplates", (res) => {
        resolve(res.aisqTemplates || []);
      });
    });
  }

  async function saveUserTemplate(name, answers) {
    const templates = await loadUserTemplates();
    templates.push({ id: "custom-" + Date.now(), name, answers, createdAt: Date.now() });
    return new Promise(resolve => {
      chrome.storage.local.set({ aisqTemplates: templates }, resolve);
    });
  }

  async function deleteUserTemplate(id) {
    const templates = await loadUserTemplates();
    const updated = templates.filter(t => t.id !== id);
    return new Promise(resolve => {
      chrome.storage.local.set({ aisqTemplates: updated }, resolve);
    });
  }

  function chainCard(chain, index) {
    const counts = Core.chainCounts(chain);
    let status = counts.pending ? "running" : counts.queued === 0 ? "done" : "queued";
    const selected = ctx.state.selectedChainId === chain.id;
    const isActive = ctx.state.runner.activeChainId === chain.id;
    const isPaused = isActive && !ctx.state.runner.enabled;
    let highlightClass = "";
    if (isActive) highlightClass = isPaused ? " aisq-highlight-paused" : " aisq-highlight-running";
    
    const justImported = ctx.state.ui && ctx.state.ui.lastImportId === chain.id;
    if (justImported) {
       highlightClass += " just-imported";
       setTimeout(() => { 
         if (ctx.state.ui.lastImportId === chain.id) { 
           ctx.state.ui.lastImportId = null; 
           ctx.requestRender(); 
         } 
       }, 2000);
    }
    
    const locked = isActive && ctx.state.runner.enabled;
    const card = el("div", { className: `aisq-chain-card ${locked ? "locked" : ""} ${selected ? "selected" : ""}${highlightClass}` });
    const previewText = (chain.preface ? chain.preface + "\n\n" : "") + chain.prompts.map((p) => p.text).join("\n\n");
    const titlePreview = previewText.length > 800 ? previewText.slice(0, 800) + "..." : previewText;
    
    const nameBtn = button(`${index + 1}. ${chain.name}`, () => {
      ctx.command("SELECT_CHAIN", { chainId: chain.id });
      ctx.mutate(() => { ctx.state.settings.activeTab = "prompts"; });
    }, selected ? "primary" : "ghost");
    nameBtn.title = titlePreview;
    
    let currentIndex = chain.prompts.findIndex(p => ["pending", "queued", "error"].includes(p.status));
    if (currentIndex === -1) currentIndex = chain.prompts.length;
    const displayIndex = currentIndex < counts.total ? currentIndex + 1 : counts.total;
    
    const runNext = button("Run Next", () => ctx.command("JUMP_TO_CHAIN", { chainId: chain.id }), "ghost", `Move ${chain.name} to be the immediate next target`);
    
    const upBtn = button("↑", () => ctx.command("MOVE_CHAIN", { chainId: chain.id, direction: -1 }), "ghost", `Move ${chain.name} up`);
    const downBtn = button("↓", () => ctx.command("MOVE_CHAIN", { chainId: chain.id, direction: 1 }), "ghost", `Move ${chain.name} down`);
    const bottomBtn = button("⤓", () => ctx.command("MOVE_CHAIN_TO_BOTTOM", { chainId: chain.id }), "ghost", `Move ${chain.name} to bottom`);
    
    if (isActive) {
      runNext.disabled = true;
      upBtn.disabled = true;
      downBtn.disabled = true;
      bottomBtn.disabled = true;
    }
    
    const head = el("div", { className: "aisq-chain-head" }, [
      nameBtn,
      el("span", { className: "aisq-status", text: `${status} · ${counts.total > 0 ? displayIndex : 0}/${counts.total}` }),
      runNext,
      upBtn,
      downBtn,
      bottomBtn,
      button((ctx.state.stackOrder || []).includes(chain.id) ? "–" : "+", () => ctx.command((ctx.state.stackOrder || []).includes(chain.id) ? "REMOVE_CHAIN_FROM_STACK" : "ADD_CHAIN_TO_STACK", { chainId: chain.id }), "ghost", (ctx.state.stackOrder || []).includes(chain.id) ? `Suspend ${chain.name}` : `Add ${chain.name} to stack`),
      button("✕", () => ctx.command("DELETE_CHAIN", { chainId: chain.id }), "danger ghost", `Delete ${chain.name}`)
    ]);
    
    const triggerChainJump = (e) => {
      if (e && e.target && e.target.closest("button:not(:first-child)")) return;
      if (locked) return;
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const doJump = () => ctx.command("FORCE_JUMP_TO_CHAIN", { chainId: chain.id });
      if (ctx.state.settings.skipJumpWarning) {
        doJump();
      } else {
        const dialog = el("dialog", { className: "aisq-dialog" });
        const title = el("h3", { text: "Jump to Chain" });
        const msg = el("p", { text: "You are jumping to a different chain. This will mark prompts in earlier pending chains as skipped. Continue?" });
        const label = el("label", { className: "aisq-checkbox-label" });
        const checkbox = el("input", { type: "checkbox" });
        label.append(checkbox, document.createTextNode(" Do not show again"));
        
        const cancel = button("Cancel", () => dialog.remove(), "ghost");
        const confirmBtn = button("Continue", () => {
          if (checkbox.checked) ctx.command("UPDATE_SETTINGS", { skipJumpWarning: true });
          dialog.remove();
          doJump();
        }, "primary");
        
        const actions = el("div", { className: "aisq-actions" }, [cancel, confirmBtn]);
        dialog.append(title, msg, label, actions);
        ctx.shadow.append(dialog);
        dialog.showModal();
      }
    };

    let lastChainClick = 0;
    head.addEventListener("click", (e) => {
      if (e.target.closest("button:not(:first-child)")) return;
      const now = Date.now();
      if (now - lastChainClick < 450) {
        lastChainClick = 0;
        triggerChainJump(e);
      } else {
        lastChainClick = now;
      }
    });
    card.append(head);
    return card;
  }

  function renderStack() {
    const wrap = el("div", { className: "aisq-section" });
    const stack = el("div", { className: "aisq-stack-list" });
    if (!ctx.state.chains || !ctx.state.chains.length) {
      wrap.append(el("p", { className: "aisq-copy", text: "No chains yet. Paste a prompt pack in Build." }));
      return wrap;
    }
    for (const [index, id] of (ctx.state.stackOrder || []).entries()) {
      const candidate = Core.getChainById(ctx.state, id);
      if (candidate) stack.append(chainCard(candidate, index));
    }
    const stored = (ctx.state.chains || []).filter((candidate) => !(ctx.state.stackOrder || []).includes(candidate.id));
    if (stored.length) {
      stack.append(el("div", { className: "aisq-help", text: "Stored but removed from stack" }));
      stored.forEach((candidate, index) => stack.append(chainCard(candidate, (ctx.state.stackOrder || []).length + index)));
    }
    wrap.append(el("div", { className: "aisq-stack-title" }, [el("strong", { text: "Execution Queue" }), el("span", { className: "aisq-copy", text: `${(ctx.state.stackOrder || []).length} chain(s)` })]), stack);
    return wrap;
  }

  function renderPrompts() {
    const chain = ctx.selectedChain();
    const wrap = el("div", { className: "aisq-section" });
    if (!ctx.state.chains || !ctx.state.chains.length) {
      wrap.append(el("p", { className: "aisq-copy", text: "No chains yet. Paste a prompt pack in Build." }));
      return wrap;
    }
    if (!chain) {
      wrap.append(el("p", { className: "aisq-copy", text: "Select a chain from the Stack tab to inspect it." }));
      return wrap;
    }

    const select = el("select", { className: "aisq-select" });
    (ctx.state.chains || []).forEach((candidate) => {
      const option = el("option", { value: candidate.id, text: `${candidate.name} (${candidate.prompts.length})` });
      option.selected = candidate.id === ctx.state.selectedChainId;
      select.append(option);
    });
    select.addEventListener("change", () => ctx.command("SELECT_CHAIN", { chainId: select.value }));
    wrap.append(field("Inspect chain", select, ctx.runnerPrompt() ? "Inspection is independent from the chain currently running." : ""));

    const name = el("input", { className: "aisq-input", value: chain.name });
    name.addEventListener("change", () => ctx.command("RENAME_CHAIN", { chainId: chain.id, name: name.value }));
    wrap.append(field("Chain name", name));
    const counts = Core.chainCounts(chain);
    wrap.append(el("div", { className: "aisq-meter", text: `${counts.complete}/${counts.total} complete · ${counts.queued} queued · ${counts.error} errors · ${counts.skipped} skipped` }));

    const list = el("div", { className: "aisq-prompt-list" });
    const hasPreface = !!(chain.preface && chain.preface.trim());
    const activePrefaceCount = chain.prompts.filter(p => p.includePreface !== false).length;
    
    const prefaceEditor = el("textarea", { 
      className: "aisq-prompt-editor aisq-preface-editor", 
      value: chain.preface || "",
      placeholder: "Type a shared intro / system context here to prepend to your prompts before execution..."
    });
    prefaceEditor.addEventListener("change", () => ctx.command("EDIT_PREFACE", { chainId: chain.id, text: prefaceEditor.value }));
    prefaceEditor.addEventListener("input", () => {
      chain.preface = Core.normalizeText(prefaceEditor.value);
    });

    const allIncluded = chain.prompts.every(p => p.includePreface !== false);
    const includeAllToggle = button(
      allIncluded ? "Exclude from all" : "Include in all", 
      () => ctx.command("TOGGLE_ALL_PREFACES", { chainId: chain.id, include: !allIncluded }),
      allIncluded ? "ghost aisq-preface-on" : "ghost"
    );
    includeAllToggle.title = allIncluded 
      ? "System Context is currently enabled on all prompts in this chain. Click to exclude from all." 
      : "Click to enable System Context on all prompts in this chain.";

    const prefaceBadge = el("span", { 
      className: `aisq-preface-badge ${hasPreface ? "" : "empty"}`, 
      text: hasPreface ? `${activePrefaceCount}/${chain.prompts.length} active · ${chain.preface.length}c` : "empty" 
    });

    const extractIntroBtn = !hasPreface
      ? button("⚡ Extract Intro", () => {
          ctx.command("EXTRACT_CHAIN_PREFACE", { chainId: chain.id });
        }, "ghost aisq-btn-extract", "Auto-extract shared intro from prompts into System Context")
      : null;

    const clearPreface = hasPreface
      ? button("Clear", () => {
          if (confirm("Clear System Context text for this chain?")) ctx.command("EDIT_PREFACE", { chainId: chain.id, text: "" });
        }, "danger ghost")
      : null;

    const prefaceSummary = el("summary", { className: "aisq-prompt-head aisq-preface-head" }, [
      el("strong", { text: "System Context (Intro)" }),
      prefaceBadge,
      ...(extractIntroBtn ? [extractIntroBtn] : []),
      includeAllToggle,
      ...(clearPreface ? [clearPreface] : [])
    ]);
    const prefaceDetails = el("details", { className: "aisq-prompt aisq-preface-card" }, [prefaceSummary, prefaceEditor]);
    if (hasPreface) prefaceDetails.open = true;
    list.append(prefaceDetails);

    chain.prompts.forEach((prompt, index) => {
      const locked = prompt.status === "pending" || prompt.status === "complete" || ctx.state.runner.pendingPromptId === prompt.id;
      const editor = el("textarea", { className: "aisq-prompt-editor", value: prompt.text, disabled: locked });
      editor.addEventListener("change", () => ctx.command("EDIT_PROMPT", { chainId: chain.id, promptId: prompt.id, text: editor.value }));
      const up = button("↑", () => ctx.command("MOVE_PROMPT", { chainId: chain.id, promptId: prompt.id, direction: -1 }), "ghost", `Move ${prompt.label} earlier`);
      const down = button("↓", () => ctx.command("MOVE_PROMPT", { chainId: chain.id, promptId: prompt.id, direction: 1 }), "ghost", `Move ${prompt.label} later`);
      up.disabled = locked || index === 0 || ["pending", "complete"].includes(chain.prompts[index - 1]?.status);
      down.disabled = locked || index === chain.prompts.length - 1 || ["pending", "complete"].includes(chain.prompts[index + 1]?.status);
      const merge = button("Merge", () => ctx.command("MERGE_PROMPT", { chainId: chain.id, promptId: prompt.id }), "ghost");
      const remove = button("Delete", () => ctx.command("DELETE_PROMPT", { chainId: chain.id, promptId: prompt.id }), "danger ghost");
      
      const controls = [up, down, merge, remove];
      const isIntroActive = hasPreface && prompt.includePreface !== false;
      const togglePreface = button(
        !hasPreface ? "Intro (No Preface)" : (isIntroActive ? "✓ Intro On" : "✕ Intro Off"), 
        () => ctx.command("TOGGLE_PROMPT_PREFACE", { chainId: chain.id, promptId: prompt.id, include: prompt.includePreface === false }),
        !hasPreface ? "ghost aisq-preface-disabled" : (isIntroActive ? "ghost aisq-preface-on" : "ghost aisq-preface-off")
      );
      togglePreface.title = !hasPreface 
        ? "No text configured in System Context (Intro) above." 
        : (isIntroActive ? "System Context is currently prepended to this prompt. Click to turn off." : "System Context is excluded from this prompt. Click to turn on.");
      controls.unshift(togglePreface);
      
      const runNext = button("Run Next", () => ctx.command("REORDER_TO_NEXT", { chainId: chain.id, promptId: prompt.id }), "ghost");
      runNext.title = "Move this prompt to be the immediate next target in the queue";
      controls.unshift(runNext);

      controls.forEach((control) => { 
        control.disabled = locked || prompt.status === "skipped";
        control.addEventListener("click", (e) => e.stopPropagation());
      });
      const isRunning = ctx.state.runner.pendingPromptId === prompt.id;
      const isPaused = isRunning && !ctx.state.runner.enabled;
      let highlightClass = "";
      if (isRunning) highlightClass = isPaused ? " aisq-highlight-paused" : " aisq-highlight-running";
      
      let prefaceBanner = null;
      if (hasPreface && isIntroActive) {
        const snippet = chain.preface.length > 70 ? chain.preface.slice(0, 67) + "..." : chain.preface;
        prefaceBanner = el("div", { className: "aisq-preface-attached-banner", title: `Prepended preface:\n${chain.preface}` }, [
          el("span", { className: "aisq-preface-attached-tag", text: "📌 +Intro" }),
          el("span", { className: "aisq-preface-attached-text", text: snippet })
        ]);
      }

      const details = el("details", { className: `aisq-prompt aisq-${prompt.status}${highlightClass}` });
      if (isRunning || prompt.status === "error") details.open = true;
      const indexBadge = el("span", { className: "aisq-index", text: `${index + 1}`, title: "Click or double-click to set as current prompt" });
      const summary = el("summary", { className: "aisq-prompt-head" }, [indexBadge, el("strong", { text: prompt.label }), el("span", { className: "aisq-status", text: prompt.status }), ...controls]);
      
      const triggerJump = (e) => {
        if (e && e.target && e.target.closest("button")) return;
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        const doJump = () => ctx.command("JUMP_TO_PROMPT", { chainId: chain.id, promptId: prompt.id });
        if (ctx.state.settings.skipJumpWarning) {
          doJump();
        } else {
          const dialog = el("dialog", { className: "aisq-dialog" });
          const title = el("h3", { text: "Set Current Prompt" });
          const msg = el("p", { text: `Jump to prompt ${index + 1} (${prompt.label})? Earlier pending prompts will be marked skipped.` });
          const label = el("label", { className: "aisq-checkbox-label" });
          const checkbox = el("input", { type: "checkbox" });
          label.append(checkbox, document.createTextNode(" Do not show again"));
          
          const cancel = button("Cancel", () => dialog.remove(), "ghost");
          const confirmBtn = button("Continue", () => {
            if (checkbox.checked) ctx.command("UPDATE_SETTINGS", { skipJumpWarning: true });
            dialog.remove();
            doJump();
          }, "primary");
          
          const actions = el("div", { className: "aisq-actions" }, [cancel, confirmBtn]);
          dialog.append(title, msg, label, actions);
          ctx.shadow.append(dialog);
          dialog.showModal();
        }
      };

      indexBadge.addEventListener("click", triggerJump);
      
      let lastPromptClick = 0;
      summary.addEventListener("click", (e) => {
        if (e.target.closest("button") || e.target.closest(".aisq-index")) return;
        const now = Date.now();
        if (now - lastPromptClick < 450) {
          lastPromptClick = 0;
          triggerJump(e);
        } else {
          lastPromptClick = now;
        }
      });
      
      const moveIntroBtn = !hasPreface && prompt.text.includes("\n\n")
        ? button("✂️ Move 1st para to Preface", () => {
            ctx.command("MOVE_PARAGRAPH_TO_PREFACE", { chainId: chain.id, promptId: prompt.id });
          }, "ghost aisq-move-intro-btn", "Move the first paragraph of this prompt into the shared Preface")
        : null;

      const detailsChildren = [
        summary,
        prefaceBanner,
        moveIntroBtn,
        editor,
        prompt.error ? el("div", { className: "aisq-error", text: prompt.error }) : null,
        prompt.status === "complete" ? button("Reset from here", () => {
          if (confirm(`Reset ${prompt.label} and all later prompts?`)) ctx.command("RESET_FROM_PROMPT", { chainId: chain.id, promptId: prompt.id });
        }, "ghost") : null
      ].filter(Boolean);
      details.append(...detailsChildren);
      list.append(details);
    });
    const addPromptText = el("input", { className: "aisq-input", placeholder: "New prompt text" });
    const addPrompt = () => { const result = ctx.command("ADD_PROMPT", { chainId: chain.id, text: addPromptText.value }); if (result.ok) addPromptText.value = ""; };
    const deleteChain = button("Delete chain", () => {
      if (confirm(`Delete ${chain.name}? This removes its prompts.`)) {
        const res = ctx.command("DELETE_CHAIN", { chainId: chain.id }, { history: { kind: "chain_deleted", message: `Deleted ${chain.name}` } });
        if (res.ok) ctx.toast(`🗑 Deleted "${chain.name}"`, "info");
      }
    }, "danger ghost");
    const duplicate = button("Duplicate chain", () => {
      const res = ctx.command("DUPLICATE_CHAIN", { chainId: chain.id }, { history: { kind: "chain_duplicated", message: `Duplicated ${chain.name}` } });
      if (res.ok) ctx.toast(`✅ Duplicated "${chain.name}"`, "success");
    }, "ghost");
    const extractPrefaceBtn = button("Extract shared intro", () => {
      ctx.command("EXTRACT_CHAIN_PREFACE", { chainId: chain.id });
    }, "ghost", "Detect and extract repeating intro text from prompts into System Context (Intro)");
    const skip = button("Skip chain", () => ctx.command("SKIP_CHAIN", { chainId: chain.id }, { history: { kind: "chain_skipped", message: `Skipped ${chain.name}` } }), "ghost");
    wrap.append(list, field("Add prompt", addPromptText), el("div", { className: "aisq-actions" }, [button("Add prompt", addPrompt, "primary"), duplicate, extractPrefaceBtn, skip, button("Reset chain", ctx.resetSelectedChain, "ghost"), deleteChain]));
    return wrap;
  }

  function renderRun() {
    const counts = Core.stackCounts(ctx.state);
    const host = ctx.scanHost();
    const currentChain = ctx.runnerChain();
    const current = ctx.runnerPrompt();
    const phase = ctx.state.runner.phase.replaceAll("_", " ");
    const foreignPending = !!(ctx.state.runner.pendingPromptId && ctx.state.runner.ownerTabId && ctx.state.runner.ownerTabId !== ctx.tabId && !ctx.leaseToken);
    const stickyHeader = el("div", { className: "aisq-sticky-header" }, [
      el("div", { className: "aisq-run-card" }, [el("span", { className: `aisq-phase aisq-phase-${ctx.state.runner.phase}`, text: phase }), el("strong", { text: current?.label || currentChain?.name || "No active prompt" }), el("span", { className: "aisq-copy", text: `${counts.complete}/${counts.prompts} complete` })]),
      el("div", { className: "aisq-meter", text: `Stack: ${counts.chains} chain(s) · ${counts.queued} queued · ${counts.pending} pending · ${counts.error} errors` })
    ]);
    return el("div", { className: "aisq-section" }, [
      stickyHeader,
      el("div", { className: "aisq-host-grid" }, [el("span", { text: "Page" }), el("strong", { text: host.mode }), el("span", { text: "AI Studio" }), el("strong", { text: host.lastHeader || host.state }), el("span", { text: "Turns" }), el("strong", { text: `${host.turnCount} (baseline ${ctx.state.runner.baselineTurnCount || 0})` }), el("span", { text: "Retries" }), el("strong", { text: `${ctx.state.runner.retryCount || 0}/${Number(ctx.state.settings.maxRetries || 0) === 0 ? "∞" : ctx.state.settings.maxRetries}` })]),
      ctx.runnerOwnedByOtherTab || foreignPending ? el("div", { className: "aisq-error", text: "Another AI Studio tab owns the pending runner. Recover here only in the same bound app after the original tab closes or its lease expires." }) : null,
      ctx.state.runner.crashRecovery ? el("div", { className: "aisq-error aisq-crash-banner" }, [
        el("strong", { text: "⚠️ Rehydrated from Crash" }),
        el("br"),
        el("span", { text: "The browser or extension restarted unexpectedly while the runner was active. Please verify AI Studio state before resuming." }),
        el("br"),
        button("Dismiss", () => { ctx.mutate(() => { ctx.state.runner.crashRecovery = false; }); }, "ghost")
      ]) : null,
      ctx.state.runner.lastError ? el("div", { className: "aisq-error", text: ctx.state.runner.lastError }) : null,
      ctx.exportStep ? el("div", { className: "aisq-meter", text: ctx.exportStep }) : null,
      
      (function() {
        if (typeof AISQAuthority !== "undefined" && AISQAuthority.inferLevel(ctx.state.settings).level < 4) {
          return el("div", { className: "aisq-lock-banner", style: "margin: 8px 0; padding: 8px; border-left: 3px solid #fbbc04; background: #fff8e1;" }, [
            el("strong", { text: "🔒 Architectural Review" }),
            el("div", { text: "L4 Autonomy is locked until Phase 4 execution engine is fully complete." })
          ]);
        }
        return null;
      })(),

      (function() {
        const activeGoal = ctx.state.goals ? ctx.state.goals.find(g => g.status === 'active') : null;
        if (activeGoal) {
          return el("div", { className: "aisq-goal-dashboard", style: "margin: 8px 0; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" }, [
            el("strong", { text: "🎯 Active Goal" }),
            el("div", { text: activeGoal.description }),
            el("div", { className: "aisq-meter", text: `Plan: ${activeGoal.plan.steps.length} steps` })
          ]);
        }
        return null;
      })(),

      (function() {
        if (ctx.state.memory && ctx.state.memory.learnedPreferences && ctx.state.memory.learnedPreferences.length > 0) {
          return el("div", { className: "aisq-memory-dashboard", style: "margin: 8px 0; padding: 8px; border: 1px solid #cce5ff; border-radius: 4px; background: #e6f2ff;" }, [
            el("strong", { text: "🧠 Learned Memory" }),
            ...ctx.state.memory.learnedPreferences.slice(-3).map(p => el("div", { text: `• ${p.text}` }))
          ]);
        }
        return null;
      })(),

      el("div", { className: "aisq-actions" }, [
        button("Download ZIP", () => void ctx.downloadZip(), "ghost"),
        button("Diagnostics", ctx.downloadDiagnostics, "ghost", "Download redacted Copilot diagnostics")
      ]),
      el("p", { className: "aisq-help", text: "The runner submits one prompt at a time, waits for a newer stable assistant turn, then advances through the editable stack without wrapping." })
    ]);
  }

  function numberSetting(key, label, divisor = 1, min = 0) {
    const input = el("input", { className: "aisq-input", type: "number", value: Number(ctx.state.settings[key]) / divisor });
    input.min = String(min);
    input.addEventListener("change", () => ctx.mutate(() => { ctx.state.settings[key] = Math.max(min, Number(input.value) || 0) * divisor; }));
    return field(label, input);
  }

  function checkboxSetting(key, label, help = "") {
    const input = el("input", { type: "checkbox", checked: ctx.state.settings[key], on: { change: () => ctx.mutate(() => { ctx.state.settings[key] = input.checked; }) } });
    const line = el("label", { className: "aisq-check" }, [input, el("span", { text: label })]);
    if (help) line.append(el("small", { text: help }));
    return line;
  }

  function renderSettings() {
    const autonomy = el("select", { className: "aisq-select" });
    if (typeof AISQAuthority !== "undefined") {
      const levels = Object.values(AISQAuthority.LEVELS).sort((a, b) => a.level - b.level);
      const currentLevel = AISQAuthority.inferLevel(ctx.state.settings);
      for (const level of levels) {
        const option = el("option", { value: level.name, text: `${level.name} - ${level.description}` });
        option.selected = currentLevel.level === level.level;
        option.disabled = level.level >= 4; // L4 locked until Phase 4
        autonomy.append(option);
      }
      autonomy.disabled = true; // Read-only in Phase 3, inferred from below
    }

    const failure = el("select", { className: "aisq-select" });
    for (const [value, label] of [["pause", "Pause on failure"], ["skip_prompt", "Skip failed prompt"], ["skip_chain", "Skip failed chain"]]) {
      const option = el("option", { value, text: label });
      option.selected = ctx.state.settings.failurePolicy === value;
      failure.append(option);
    }
    failure.addEventListener("change", () => ctx.mutate(() => { ctx.state.settings.failurePolicy = failure.value; }));
    const placement = el("select", { className: "aisq-select" });
    for (const [value, label] of [["end", "Append new pastes to end"], ["after", "Insert after selected chain"]]) {
      const option = el("option", { value, text: label });
      option.selected = ctx.state.settings.pastePlacement === value;
      placement.append(option);
    }
    placement.addEventListener("change", () => ctx.mutate(() => { ctx.state.settings.pastePlacement = placement.value; }));
    return el("div", { className: "aisq-section" }, [
      field("Autonomy Level", autonomy),
      checkboxSetting("autoRun", "Continue automatically across the stack", "Turn off for one-at-a-time manual Resume control."),
      checkboxSetting("autoRetry", "Automatically retry AI Studio failures", "Retries only the newest failed turn."),
      checkboxSetting("stopAfterChain", "Pause after the current chain", "Useful for reviewing output before the next paste chain."),
      field("New-paste placement", placement),
      field("Failure policy", failure),
      numberSetting("maxRetries", "Maximum retries (0 = unlimited)", 1, 0),
      numberSetting("retryDelayMs", "Retry delay (seconds)", 1000),
      numberSetting("settleMs", "Completion settle window (seconds)", 1000, 0.5),
      numberSetting("interPromptDelayMs", "Delay between prompts (seconds)", 1000),
      numberSetting("interChainDelayMs", "Delay between chains (seconds)", 1000),
      numberSetting("startTimeoutMs", "Start timeout (seconds)", 1000, 5),
      numberSetting("completionTimeoutMs", "Completion timeout (minutes)", 60000, 1),
      checkboxSetting("autoAllowAccess", "Click Allow access automatically", "Off by default."),
      checkboxSetting("autoFix", "Click AI Studio Auto-fix automatically", "Off by default because it can modify generated files."),
      checkboxSetting("autoDownloadOnDone", "Download ZIP after the whole stack completes"),
      el("div", { className: "aisq-shortcuts" }, [
        el("strong", { text: "Shortcuts" }), 
        el("span", { text: "Alt+Shift+A — toggle ctx.panel" }), 
        el("span", { text: "Alt+Enter — start/resume stack" }),
        button("Reload Extension (Dev)", () => {
          const btn = ctx.shadow.querySelector("button:focus");
          if (btn) btn.textContent = "Reloading...";
          chrome.runtime.sendMessage({ type: "AISQ_RELOAD_EXTENSION" });
        }, "ghost", "Hard-reloads the extension background worker and injects fresh content scripts without reloading the webpage")
      ])
    ]);
  }

  function stopActiveAI() {
    const host = ctx.scanHost();
    if (host.stop) {
      ctx.robustClick(host.stop);
      ctx.addHistory("ai_stopped", "User stopped AI Studio generation");
    }
    if (ctx.state.runner.enabled) {
      ctx.pauseRunner();
    } else {
      ctx.requestRender();
    }
  }

  function renderTopRunControls() {
    const isPromptsTab = ctx.state.settings.activeTab === "prompts";
    const startLabel = ctx.state.runner.phase === PHASES.PAUSED ? "▶️ Resume" : "▶️ Start";
    const foreignPending = !!(ctx.state.runner.pendingPromptId && ctx.state.runner.ownerTabId && ctx.state.runner.ownerTabId !== ctx.tabId && !ctx.leaseToken);
    
    const primaryControl = foreignPending
      ? button("🔁 Recover", () => { ctx.mutate(() => { ctx.state.uiIntent = { action: 'recover' }; }); }, "primary aisq-btn-highlight", "Explicitly recover the pending runner in this AI Studio app")
      : !ctx.state.runner.enabled
        ? button(startLabel, () => {
            ctx.mutate(() => {
              if (ctx.state.runner.phase === PHASES.PAUSED) ctx.state.uiIntent = { action: 'resume' };
              else ctx.state.uiIntent = { action: 'start', scope: 'stack' };
            });
          }, "primary aisq-btn-highlight")
        : (ctx.leaseToken || ctx.state.runner.ownerTabId === ctx.tabId || !ctx.state.runner.ownerTabId) ? button("⏸️ Pause", () => { ctx.mutate(() => { ctx.state.uiIntent = { action: 'pause' }; }); }, "aisq-btn-pause") : button("🔒 Locked", () => {}, "ghost", "Runner is owned by another AI Studio tab");

    const host = ctx.scanHost();
    const isHostBusy = host.busy || !!host.stop;
    const stopAiControl = (ctx.state.runner.enabled || ctx.state.runner.phase === PHASES.PAUSED) && isHostBusy && host.stop
      ? button("⏹️ Stop AI", stopActiveAI, "danger ghost aisq-btn-stop", "Stop current AI Studio generation immediately")
      : null;

    const runSelected = button("⏏️ Run Selected", () => { ctx.mutate(() => { ctx.state.uiIntent = { action: 'start', scope: 'selected' }; }); }, "ghost");
    runSelected.disabled = !isPromptsTab || ctx.state.runner.enabled || !!ctx.state.runner.pendingPromptId;

    const skipCurrent = button("⏭️ Skip", () => { ctx.mutate(() => { ctx.state.uiIntent = { action: 'skip' }; }); }, "ghost");
    skipCurrent.disabled = !isPromptsTab || foreignPending || (ctx.state.runner.enabled && !ctx.leaseToken);

    const currentChain = ctx.runnerChain();
    const current = ctx.runnerPrompt();
    let phaseText = ctx.state.runner.phase.replaceAll("_", " ");
    if (isHostBusy && host.thinkingText) {
      phaseText = `${phaseText} · ${host.thinkingText}`;
    }
    const targetText = current?.label || currentChain?.name || "No active prompt";

    // Mode status pill
    let modePillClass = "aisq-host-badge";
    let modeText = "Searching...";
    if (host.mode === "editor") {
      if (isHostBusy) {
        modePillClass += " aisq-host-busy";
        modeText = host.thinkingText || "AI Generating";
      } else {
        modePillClass += " aisq-host-editor";
        modeText = "Editor Ready";
      }
    } else if (host.mode === "start") {
      modePillClass += " aisq-host-start";
      modeText = "Start Page";
    } else {
      modePillClass += " aisq-host-unsupported";
      modeText = "Not in Apps";
    }
    const hostPill = el("span", { className: modePillClass, text: modeText });

    let autonomyPill = null;
    if (typeof AISQAuthority !== "undefined") {
      const level = AISQAuthority.inferLevel(ctx.state.settings);
      const isL4 = level.level >= 4;
      autonomyPill = el("span", { className: `aisq-host-badge ${isL4 ? 'aisq-l4' : ''}`, text: level.name.split(':')[0] });
    }

    const controls = [primaryControl];
    if (stopAiControl) controls.push(stopAiControl);
    controls.push(runSelected, skipCurrent);

    return el("div", { className: "aisq-top-run-controls" }, [
      ...controls,
      el("div", { className: "aisq-top-status" }, [
        autonomyPill,
        hostPill,
        el("span", { className: `aisq-phase aisq-phase-${ctx.state.runner.phase}`, text: phaseText }),
        el("strong", { text: targetText })
      ].filter(Boolean))
    ]);
  }

  Object.assign(ctx, {
    el,
    button,
    field,
    importText,
    stopActiveAI,
    renderTopRunControls,
    renderBuild,
    renderStack,
    renderPrompts,
    renderRun,
    renderSettings
  });

  console.log("[AISQ] ui-tabs.js loaded successfully.");
  
  // All content scripts have now executed synchronously. It is safe to initialize.
  if (typeof ctx.init === "function") {
    ctx.init().catch(err => console.error("[AISQ] ERROR during init:", err));
  } else {
    console.error("[AISQ] SYNC ERROR: ctx.init is not a function!");
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
