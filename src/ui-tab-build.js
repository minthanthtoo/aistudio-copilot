(function initAISQUITabBuild(global) {
  "use strict";
  const Core = global.AISQCore;
  const ctx = global.AISQContext;
  const { el, button, field } = global.AISQUIUtils;

  function importText(raw, strategy = ctx.state.ui.splitStrategy, options = {}) {
    const parsed = Core.parsePromptPack(raw, strategy);
    if (!parsed.prompts.length) {
      alert("No prompts found.");
      return { ok: false };
    }
    const number = (ctx.state.chains || []).length + 1;
    const chain = Core.makeChain(options.name || `Chain ${number}`, parsed.prompts, raw, { splitStrategy: parsed.strategy, pastedAt: Core.nowISO(), preface: options.preface || parsed.preface });
    
    const placement = ctx.state.settings.pastePlacement === "end" ? "bottom" : "after";
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
    ctx.state.ui.buildView = ctx.state.ui.buildView || "input"; // "input", "plan_details", "wizard_details"
    
    
    if (ctx.state.ui.buildView === "plan_details") {
      return ctx.renderDraftPlanDetails();
    }
    if (ctx.state.ui.buildView === "wizard_details") {
      return ctx.renderWizardDetails();
    }

    const smartInputContainer = el("div", { className: "aisq-section" }, [
      el("p", { className: "aisq-copy", text: "Paste prompts, a ChatGPT link, or describe what you want to build:" }),
      renderSmartInput(),
      renderAdvancedSection()
    ]);
    return smartInputContainer;
  }

  function openWizardWithAnswers(answers, source = "template") {
    const fullWizard = ctx.state.ui.wizardMode === "full";
    ctx.__planApprovalBusy = false;
    ctx.mutate(() => {
      const plan = globalThis.AISQPlan;
      let planDraft = plan.createDraft(source, answers || {});
      let resolved = plan.resolveDraft(planDraft, { specApi: globalThis.AISQSpec });
      if (resolved.activeQuestionId) {
        planDraft = plan.markQuestionShown(resolved.draft, resolved.activeQuestionId);
        resolved = plan.resolveDraft(planDraft, { specApi: globalThis.AISQSpec });
        Core.commitTransition(ctx.state, Core.EVENTS.PLAN_QUESTION_SHOWN, { questionId: resolved.activeQuestionId, source: fullWizard ? "full-wizard" : "draft-plan" });
      }
      ctx.state.ui.specAnswers = JSON.parse(JSON.stringify(resolved.generatedAnswers));
      ctx.state.ui.planDraft = resolved.draft;
      ctx.state.ui.pendingPlanCommitId = null;
      ctx.state.ui.planMapFocusId = resolved.activeQuestionId;
      ctx.state.ui.buildView = fullWizard ? "wizard_details" : "plan_details";
      ctx.state.ui.specMode = fullWizard ? "full" : "draft";
    });
    ctx.requestRender();
  }

  function startWizardWithTemplate(templateId) {
    const specApi = globalThis.AISQSpec;
    const t = specApi.BUILT_IN_TEMPLATES.find(x => x.id === templateId);
    if (!t) return;
    openWizardWithAnswers(t.answers, "template");
  }

  function startWizardWithDescription(desc) {
    if (!desc.trim()) return;
    openWizardWithAnswers({ rawDescription: desc.trim(), description: desc.trim() }, "user");
  }

  function renderWizardModeChooser() {
    const mode = ctx.state.ui.wizardMode === "full" ? "full" : "plan";
    const choose = (next) => ctx.mutate(() => { ctx.state.ui.wizardMode = next; });
    return el("div", { className: "aisq-build-mode", attrs: { role: "group", "aria-label": "Build workflow" } }, [
      el("strong", { text: "Choose workflow" }),
      button("Draft Plan", () => choose("plan"), mode === "plan" ? "primary" : "ghost", "Use the Draft Plan workflow"),
      button("Full Wizard", () => choose("full"), mode === "full" ? "primary" : "ghost", "Use the original full wizard form"),
      el("small", { text: mode === "full" ? "The original step-by-step form is selected." : "Draft Plan is the low-interruption workflow." })
    ]);
  }

    function renderSmartInput() {
    let currentDetectType = "empty";
    
    const draft = el("textarea", {
      className: "aisq-draft",
      value: ctx.state.ui.draft,
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
                  ctx.mutate(()=>{ ctx.state.ui.draft = ""; ctx.state.ui.planDraft = null; ctx.state.ui.specAnswers = {}; ctx.state.settings.activeTab = "stack"; });
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
    
    const strategySelect = el("select", { className: "aisq-select", style: "position: absolute; top: 12px; right: 12px; width: auto; max-width: 140px; padding: 2px 20px 2px 6px; font-size: 11px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; color: #cfcbd9; cursor: pointer;", title: "Raw Text Splitter format" });
    const strats = [["auto", "Auto-detect"], ["stage", "Phase headings"], ["id", "P001 IDs"], ["prompt", "Prompt headings"], ["delimiter", "Delimiters"], ["numbered", "Numbered blocks"], ["single", "Single prompt"]];
    for (const [value, label] of strats) {
      const option = el("option", { value, text: label });
      if (value === (ctx.state.ui.splitStrategy || "auto")) option.selected = true;
      strategySelect.append(option);
    }
    strategySelect.addEventListener("change", () => {
      ctx.mutate(() => { ctx.state.ui.splitStrategy = strategySelect.value; });
      updateSmartUI();
    });

    const inputWrapper = el("div", { style: "position: relative; width: 100%;" }, [draft, badgeContainer, strategySelect]);
    
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
      } else if (/https?:\/\/(www\.)?chatgpt\.com\/share\/[0-9a-fA-F-]+/.test(val) || val.includes("streamController.enqueue")) {
        detectType = "chatgpt";
      } else if (val.startsWith("{") && val.endsWith("}")) {
        try { JSON.parse(val); detectType = "json"; } catch(e) { detectType = "natural"; }
      } else {
        const strategy = ctx.state.ui.splitStrategy || "auto";
        parsedPrompts = Core.parsePromptPack(val, strategy);
        if (parsedPrompts.prompts.length > 1 || strategy !== "auto") {
          detectType = "prompts";
        } else {
          detectType = "natural";
        }
      }
      
      currentDetectType = detectType;

      // Update placeholder dynamically based on selected strategy
      const strategy = ctx.state.ui.splitStrategy || "auto";
      let placeholderText = "Paste prompts, ChatGPT share URL, JSON template, or app description...";
      if (strategy === "stage") placeholderText = "[Stage 1]\nFirst prompt...\n\n[Stage 2]\nSecond prompt...";
      else if (strategy === "id") placeholderText = "P001: First prompt...\nP002: Second prompt...";
      else if (strategy === "prompt") placeholderText = "Prompt 1:\nFirst prompt...\n\nPrompt 2:\nSecond prompt...";
      else if (strategy === "delimiter") placeholderText = "First prompt...\n---\nSecond prompt...\n***\nThird prompt...";
      else if (strategy === "numbered") placeholderText = "1. First prompt...\n2. Second prompt...";
      else if (strategy === "single") placeholderText = "Everything pasted here will become one single giant prompt.";
      draft.placeholder = placeholderText;

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
              ctx.state.ui.draft = "";
              openWizardWithAnswers(specAnswers, "extractor");
              ctx.toast(`✅ Extracted ${conversation.visibleMessages.length} messages`, "success");
           } catch(e) {
              ctx.toast(`Error: ${e.message}`, "error");
           }
        }, "primary"));
      } else if (detectType === "json") {
        actionArea.append(button("Load as Template", () => {
           const specApi = globalThis.AISQSpec;
           const parsed = specApi.deserializeTemplate(val);
           if (parsed) {
             ctx.state.ui.draft = "";
             openWizardWithAnswers(parsed, "template");
             ctx.toast("✅ Template loaded", "success");
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
             if(res.ok) { ctx.mutate(()=>{ ctx.state.ui.draft = ""; ctx.state.ui.planDraft = null; ctx.state.ui.specAnswers = {}; ctx.state.settings.activeTab = "stack"; }); ctx.requestRender(true); }
          }, "primary"),
          button("Add & Run ▶", () => {
             if (ctx.shadow?.activeElement?.blur) ctx.shadow.activeElement.blur();
             const res = importText(ctx.state.ui.draft, ctx.state.ui.splitStrategy);
             if (res.ok) {
               ctx.mutate(() => { ctx.state.ui.draft = ""; ctx.state.ui.planDraft = null; ctx.state.ui.specAnswers = {}; ctx.state.settings.activeTab = "stack"; ctx.state.uiIntent = { action: 'start', scope: 'stack' }; });
               ctx.requestRender(true);
             }
          }, "ghost")
        );
      } else if (detectType === "natural") {
        actionArea.append(
          button("✨ Build with Wizard → (Draft Plan)", () => startWizardWithDescription(val), "primary"),
          button("🧭 Open Full Wizard →", () => {
            ctx.mutate(() => { ctx.state.ui.wizardMode = "full"; });
            startWizardWithDescription(val);
          }, "ghost")
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
            openWizardWithAnswers(t.answers, "template");
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
    return el("div", { style: "position: relative;" }, [renderWizardModeChooser(), inputWrapper, actionArea, extraContentArea]);
  }

  function renderAdvancedSection() {
    ctx.state.ui.showAdvanced = ctx.state.ui.showAdvanced || false;
    const summary = el("summary", { style: "cursor: pointer; font-weight: 600; font-size: 13px; color: #cfcbd9; outline: none; margin-bottom: 12px;", text: "⚙️ Advanced Settings" });
    summary.addEventListener("click", (e) => {
      e.preventDefault();
      ctx.mutate(() => { ctx.state.ui.showAdvanced = !ctx.state.ui.showAdvanced; });
      ctx.requestRender();
    });

    const details = el("details", { open: ctx.state.ui.showAdvanced, style: "margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.08);" }, [summary]);

    if (ctx.state.ui.showAdvanced) {
      details.open = true;

      // 2. Template Manager
      const myTemplatesContainer = el("div", { className: "aisq-field", style: "padding: 12px; background: rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px;" });
      
      const headerRow = el("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;" }, [
        el("strong", { text: "My Saved Templates", style: "font-size: 12px; color: #a9a6b4;" })
      ]);
      myTemplatesContainer.append(headerRow);
      
      const listContainer = el("div", { style: "display: flex; flex-direction: column; gap: 8px;" });
      myTemplatesContainer.append(listContainer);
      
      const renderMyTemplates = async () => {
        const templates = await loadUserTemplates();
        listContainer.innerHTML = "";
        
        if (templates.length === 0) {
          listContainer.appendChild(el("div", { style: "font-size: 11px; color: #666; font-style: italic; padding: 8px; text-align: center; background: rgba(255,255,255,0.02); border-radius: 6px;", text: "No saved templates yet." }));
        } else {
          templates.forEach(t => {
            const row = el("div", { style: "display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: #222128; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);" }, [
              el("span", { style: "font-size: 12px; font-weight: 500; color: #f5f4fa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;", text: t.name }),
              el("div", { style: "display: flex; gap: 6px;" }, [
                button("Use", () => {
                  openWizardWithAnswers(t.answers, "template");
                }, "primary"),
                button("Export", () => {
                  const json = globalThis.AISQSpec.serializeTemplate(t.answers);
                  const blob = new Blob([json], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${t.name.replace(/\s+/g, '-').toLowerCase()}-template.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }, "ghost"),
                button("×", async () => {
                  await deleteUserTemplate(t.id);
                  renderMyTemplates();
                }, "danger", "Delete template")
              ])
            ]);
            listContainer.appendChild(row);
          });
        }
      };

      const fileInput = el("input", { type: "file", accept: ".json", style: "display: none;", on: { change: e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          const parsed = globalThis.AISQSpec.deserializeTemplate(event.target.result);
          if (parsed) {
            openWizardWithAnswers(parsed, "template");
            ctx.toast("Template imported successfully", "success");
            ctx.requestRender();
          } else {
            ctx.toast("Invalid template JSON file.", "error");
          }
        };
        reader.readAsText(file);
        e.target.value = ""; // reset
      }}});

      const importBtn = button("📥 Import JSON", () => fileInput.click(), "ghost");
      
      const actionsRow = el("div", { style: "display: flex; gap: 8px; margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px;" }, [
        fileInput,
        importBtn,
        button("✨ Open Full Wizard", () => {
          ctx.mutate(() => { ctx.state.ui.buildView = "wizard_details"; });
          ctx.requestRender();
        }, "ghost")
      ]);
      myTemplatesContainer.append(actionsRow);

      void renderMyTemplates();

      // 3. Data & Backups
      const dataSection = el("div", { className: "aisq-field", style: "margin-top: 24px; padding: 12px; background: rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px;" }, [
        el("strong", { text: "Data & Backups", style: "font-size: 12px; color: #f5f4fa; margin-bottom: 2px;" }),
        el("div", { style: "font-size: 11px; color: #a9a6b4; margin-bottom: 8px; line-height: 1.3;", text: "Export or restore the entire Copilot state (chains, prompts, settings) for this AI Studio project." })
      ]);
      
      const projectFileInput = el("input", { type: "file", accept: ".json", style: "display: none;", on: { change: e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const parsed = JSON.parse(event.target.result);
            if (!parsed || !parsed.schemaVersion || !parsed.chains) throw new Error("Invalid Copilot project backup file");
            
            if (confirm(`Restore project state?\n\nWARNING: This will completely replace your current chains, queues, and runner state for this AI Studio project!\n\nImporting: ${parsed.chains.length} chains.`)) {
              ctx.mutate(() => { 
                Object.assign(ctx.state, parsed);
                ctx.state.runner.enabled = false; // ensure it doesn't auto-run on import
              });
              ctx.toast("Project state restored successfully", "success");
            }
          } catch (err) {
            ctx.toast(err.message, "error");
          }
        };
        reader.readAsText(file);
        e.target.value = ""; // reset
      }}});

      dataSection.append(projectFileInput);
      dataSection.append(el("div", { style: "display: flex; gap: 8px;" }, [
        button("⬇️ Backup Project", () => {
          const exportData = JSON.parse(JSON.stringify(ctx.state));
          // Clean up runtime ephemeral state
          exportData.uiIntent = null;
          exportData.runner.ownerTabId = null;
          
          const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `aisq-project-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
          a.click();
          URL.revokeObjectURL(url);
          ctx.toast("Project backup downloaded", "success");
        }, "ghost"),
        button("⬆️ Restore Backup", () => projectFileInput.click(), "ghost")
      ]));

      details.append(myTemplatesContainer, dataSection);
    }
    return details;
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


  Object.assign(ctx, { importText, renderBuild, saveUserTemplate });
})(typeof globalThis !== "undefined" ? globalThis : this);
