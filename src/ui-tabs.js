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
    const result = Core.parsePromptPack(raw, strategy);
    if (!result.prompts.length) return { ok: false, error: "Nothing to import" };
    const number = ctx.state.chains.length + 1;
    const chain = Core.makeChain(options.name || `Chain ${number}`, result.prompts, raw, { splitStrategy: result.strategy, pastedAt: Core.nowISO(), preface: options.preface || result.preface });
    const placement = options.placement || ctx.state.settings.pastePlacement;
    const commandResult = ctx.command("IMPORT_CHAIN", { chain, placement, afterChainId: options.afterChainId || (placement === "after" ? ctx.state.selectedChainId : null) }, { history: { kind: "chain_imported", message: `Added ${chain.name} with ${result.prompts.length} prompt(s)`, data: { chainId: chain.id, strategy: result.strategy } } });
    if (commandResult.ok) {
      ctx.state.ui.draft = "";
      ctx.state.ui.detectedStrategy = result.strategy;
      const draftControl = ctx.shadow?.querySelector(".aisq-draft");
      if (draftControl) draftControl.value = "";
      const stackMeter = ctx.shadow?.getElementById("aisq-stack-meter");
      if (stackMeter) {
        const counts = Core.stackCounts(ctx.state);
        stackMeter.textContent = `Stack now: ${counts.chains} chain(s) · ${counts.prompts} prompt(s) · ${counts.queued} queued`;
      }
      ctx.touchState();
      ctx.scheduleSave();
      ctx.requestRender();
    }
    return commandResult;
  }

  function renderBuild() {
    ctx.state.ui.specMode = ctx.state.ui.specMode || "paste";
    ctx.state.ui.specScreen = ctx.state.ui.specScreen || 0;
    ctx.state.ui.specAnswers = ctx.state.ui.specAnswers || {};

    const modeToggle = el("div", { className: "aisq-mode-toggle", style: "display: grid; grid-template-columns: 1fr 1fr 1fr; margin-bottom: 12px; gap: 8px;" }, [
      button("📋 Paste", () => ctx.mutate(() => { ctx.state.ui.specMode = "paste"; ctx.requestRender(); }), ctx.state.ui.specMode === "paste" ? "primary" : "ghost"),
      button("✨ Wizard", () => ctx.mutate(() => { ctx.state.ui.specMode = "generate"; ctx.requestRender(); }), ctx.state.ui.specMode === "generate" ? "primary" : "ghost"),
      button("🔗 Import", () => ctx.mutate(() => { ctx.state.ui.specMode = "import"; ctx.requestRender(); }), ctx.state.ui.specMode === "import" ? "primary" : "ghost")
    ]);

    let content;
    if (ctx.state.ui.specMode === "paste") {
      content = renderPasteMode();
    } else if (ctx.state.ui.specMode === "generate") {
      content = renderWizardMode();
    } else {
      content = renderImportMode();
    }

    return el("div", { className: "aisq-section" }, [modeToggle, content]);
  }

  function renderPasteMode() {
    const draft = el("textarea", {
      className: "aisq-draft",
      value: ctx.state.ui.draft,
      placeholder: "Paste here. Stage/Phase headings, IDs, or delimiters are detected automatically.",
      on: {
        input: (event) => {
          ctx.state.ui.draft = event.target.value;
          if (/https?:\/\/(www\.)?chatgpt\.com\/share\/[0-9a-fA-F-]+/.test(ctx.state.ui.draft)) {
            ctx.state.ui.specMode = "import";
            ctx.state.ui.importSource = ctx.state.ui.draft;
            ctx.state.ui.draft = "";
            ctx.requestRender();
            return;
          }
          const parsed = Core.parsePromptPack(ctx.state.ui.draft, ctx.state.ui.splitStrategy);
          ctx.state.ui.detectedStrategy = parsed.strategy;
          ctx.scheduleSave();
          const meter = ctx.shadow.getElementById("aisq-detect-meter");
          if (meter) {
            meter.textContent = `${parsed.prompts.length} prompt${parsed.prompts.length === 1 ? "" : "s"} · ${parsed.strategy}`;
          }
        }
      }
    });
    const strategy = el("select", { className: "aisq-select", value: ctx.state.ui.splitStrategy });
    for (const [value, label] of [["auto", "Auto detect"], ["stage", "Stage / Phase headings"], ["id", "P001 / R001 IDs"], ["prompt", "Prompt headings"], ["delimiter", "Delimiters"], ["numbered", "Numbered blocks"], ["single", "Single prompt"]]) {
      const option = el("option", { value, text: label });
      if (value === ctx.state.ui.splitStrategy) option.selected = true;
      strategy.append(option);
    }
    strategy.addEventListener("change", () => {
      ctx.state.ui.splitStrategy = strategy.value;
      ctx.state.ui.detectedStrategy = Core.parsePromptPack(ctx.state.ui.draft, strategy.value).strategy;
      ctx.scheduleSave();
      ctx.requestRender();
    });
    const parsed = Core.parsePromptPack(ctx.state.ui.draft, ctx.state.ui.splitStrategy);
    const meter = el("div", { className: "aisq-meter", text: `${parsed.prompts.length} prompt${parsed.prompts.length === 1 ? "" : "s"} · ${parsed.strategy}` });
    meter.id = "aisq-detect-meter";
    const stack = Core.stackCounts(ctx.state);
    const stackMeter = el("div", { className: "aisq-meter", text: `Stack now: ${stack.chains} chain(s) · ${stack.prompts} prompt(s) · ${stack.queued} queued` });
    stackMeter.id = "aisq-stack-meter";
    const add = () => importText(ctx.state.ui.draft, ctx.state.ui.splitStrategy);
    const addRun = () => {
      const result = importText(ctx.state.ui.draft, ctx.state.ui.splitStrategy);
      if (result.ok) void ctx.startRunner();
    };
    return el("div", {}, [
      el("p", { className: "aisq-copy", text: "Paste a sequence of prompts. Click 'Add chain' to append it to the execution stack." }),
      field("Split strategy", strategy),
      field("Paste intake", draft),
      meter,
      stackMeter,
      el("div", { className: "aisq-actions" }, [button("Add chain", add, "primary"), button("Add & start", addRun, "ghost")])
    ]);
  }

  function renderImportMode() {
    ctx.state.ui.importSource = ctx.state.ui.importSource || "";
    ctx.state.ui.importState = ctx.state.ui.importState || "idle"; // idle, fetching, extracting, success, error
    ctx.state.ui.importStatusText = ctx.state.ui.importStatusText || "";
    ctx.state.ui.importResult = ctx.state.ui.importResult || null;

    if (ctx.state.ui.importState === "idle" || ctx.state.ui.importState === "error") {
      const intake = el("textarea", {
        className: "aisq-draft",
        style: "min-height: 80px;",
        value: ctx.state.ui.importSource,
        placeholder: "Paste ChatGPT share URL, or raw HTML/JSON here...",
        on: { input: e => { ctx.state.ui.importSource = e.target.value; ctx.requestRender(); } }
      });

      const analyzeBtn = button("Fetch & Analyze", async () => {
        const source = ctx.state.ui.importSource.trim();
        if (!source) return;

        ctx.mutate(() => {
          ctx.state.ui.importState = "fetching";
          ctx.state.ui.importStatusText = "Fetching conversation data...";
        });
        ctx.requestRender();

        try {
          const extractorApi = globalThis.AISQChatGPTExtractor;
          if (!extractorApi) throw new Error("Extractor API not loaded.");

          let rawHtml = source;
          if (source.startsWith("http")) {
            const res = await chrome.runtime.sendMessage({ type: "AISQ_FETCH_URL", url: source });
            if (!res.ok) throw new Error(res.error || "Failed to fetch URL.");
            rawHtml = res.html;
          }

          ctx.mutate(() => {
            ctx.state.ui.importState = "extracting";
            ctx.state.ui.importStatusText = "Extracting messages & analyzing requirements...";
          });
          ctx.requestRender();

          // Yield to let UI update
          await new Promise(r => setTimeout(r, 50));

          const conversation = extractorApi.extractConversation(rawHtml, source);
          const specAnswers = extractorApi.analyzeTranscript(conversation);

          ctx.mutate(() => {
            ctx.state.ui.importResult = { conversation, specAnswers };
            ctx.state.ui.importState = "success";
            ctx.state.ui.specAnswers = specAnswers; // prefill wizard
          });
          ctx.requestRender();

        } catch (err) {
          ctx.mutate(() => {
            ctx.state.ui.importState = "error";
            ctx.state.ui.importStatusText = err.message;
          });
          ctx.requestRender();
        }
      }, ctx.state.ui.importSource ? "primary" : "ghost");
      if (!ctx.state.ui.importSource) analyzeBtn.disabled = true;

      return el("div", {}, [
        el("p", { className: "aisq-copy", text: "Import an existing ChatGPT brainstorming session. We'll extract the tech stack and core features automatically." }),
        field("Chat Source", intake),
        ctx.state.ui.importState === "error" ? el("div", { style: "color: red; font-size: 11px; margin-bottom: 8px;" }, [el("strong", { text: "Error: " }), document.createTextNode(ctx.state.ui.importStatusText)]) : null,
        el("div", { className: "aisq-actions" }, [analyzeBtn])
      ]);
    }

    if (ctx.state.ui.importState === "fetching" || ctx.state.ui.importState === "extracting") {
      return el("div", { style: "text-align: center; padding: 24px;" }, [
        el("div", { className: "aisq-spinner", style: "margin: 0 auto 12px auto; display: block;" }),
        el("div", { style: "font-size: 13px; font-weight: 500;" }, [document.createTextNode(ctx.state.ui.importStatusText)])
      ]);
    }

    if (ctx.state.ui.importState === "success") {
      const { conversation, specAnswers } = ctx.state.ui.importResult;
      
      const summaryCard = el("div", { style: "background: #f8f9fa; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 12px;" }, [
        el("div", { style: "font-weight: 600; font-size: 14px; margin-bottom: 4px;" }, [document.createTextNode("🎉 Analysis Complete!")]),
        el("div", { style: "font-size: 12px; margin-bottom: 8px; color: #475569;" }, [document.createTextNode(`Extracted ${conversation.visibleMessages.length} messages`)]),
        
        el("div", { style: "display: grid; grid-template-columns: auto 1fr; gap: 4px 8px; font-size: 12px;" }, [
          el("strong", { text: "Title:" }), el("span", { text: specAnswers.name }),
          el("strong", { text: "Type:" }), el("span", { text: specAnswers.archetype }),
          el("strong", { text: "Stack:" }), el("span", { text: [specAnswers.frontend, specAnswers.backend, specAnswers.database].filter(x => x && x !== "None").join(", ") || "None specified" })
        ])
      ]);

      const reviewBtn = button("✨ Review & Edit in Wizard", () => {
        ctx.mutate(() => {
          ctx.state.ui.specMode = "generate";
          ctx.state.ui.specScreen = 1;
          ctx.state.ui.importState = "idle";
        });
        ctx.requestRender();
      }, "ghost");

      const generateBtn = button("🚀 Generate Prompt Chain", () => {
        ctx.mutate(() => {
          ctx.state.ui.specMode = "generate";
          ctx.state.ui.specScreen = 2;
          ctx.state.ui.importState = "idle";
        });
        ctx.requestRender();
      }, "primary");

      return el("div", {}, [
        summaryCard,
        el("div", { className: "aisq-actions" }, [reviewBtn, generateBtn])
      ]);
    }

    return el("div", { text: "Unknown ctx.state" });
  }

  function renderWizardMode() {
    const specApi = globalThis.AISQSpec;
    if (!specApi) return el("div", { text: "AISQSpec not found. Ensure spec.js is loaded." });

    ctx.state.ui.specAnswers.featureChips = ctx.state.ui.specAnswers.featureChips || [];
    ctx.state.ui.specAnswers.stageOverrides = ctx.state.ui.specAnswers.stageOverrides || {};

    if (ctx.state.ui.specScreen === 0) return renderWizardScreen0(specApi);
    if (ctx.state.ui.specScreen === 1) return renderWizardScreen1(specApi);
    if (ctx.state.ui.specScreen === 2) return renderWizardScreen2(specApi);
    return el("div", { text: "Unknown screen" });
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

  function renderWizardScreen0(specApi) {
    const nameInput = el("input", { className: "aisq-input", value: ctx.state.ui.specAnswers.name || "", placeholder: "My App", on: { input: e => { ctx.mutate(() => { ctx.state.ui.specAnswers.name = e.target.value }); } } });
    const descInput = el("input", { className: "aisq-input", value: ctx.state.ui.specAnswers.description || "", placeholder: "A to-do list app", on: { input: e => { ctx.mutate(() => { ctx.state.ui.specAnswers.description = e.target.value }); } } });
    
    // Quick Starts
    const quickStartCards = specApi.BUILT_IN_TEMPLATES.map(t => {
      const card = el("button", { 
        style: "display: flex; flex-direction: column; align-items: flex-start; padding: 8px; border: 1px solid #ccc; border-radius: 6px; background: #fafafa; min-width: 140px; cursor: pointer; text-align: left;",
        on: { click: () => {
          ctx.mutate(() => { 
            ctx.state.ui.specAnswers = JSON.parse(JSON.stringify(t.answers));
            ctx.state.ui.specScreen = 2; // Jump to preview
          });
          ctx.requestRender();
        }}
      }, [
        el("div", { style: "font-size: 20px; margin-bottom: 4px;", text: t.icon }),
        el("div", { style: "font-weight: 500; font-size: 13px;", text: t.name }),
        el("div", { style: "font-size: 11px; color: #666; margin-top: 2px;", text: t.scale })
      ]);
      return card;
    });
    
    const quickStartRow = el("div", { style: "display: flex; overflow-x: auto; gap: 8px; padding-bottom: 8px;" }, quickStartCards);
    
    // My Templates
    const myTemplatesContainer = el("div", { style: "display: flex; flex-direction: column; gap: 8px; margin-top: 8px;" });
    
    const renderMyTemplates = async () => {
      const templates = await loadUserTemplates();
      myTemplatesContainer.innerHTML = "";
      
      if (templates.length === 0) {
        myTemplatesContainer.appendChild(el("div", { style: "font-size: 12px; color: #888; font-style: italic;", text: "No saved templates yet." }));
        return;
      }
      
      templates.forEach(t => {
        const row = el("div", { style: "display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: #fff; border: 1px solid #ddd; border-radius: 4px;" }, [
          el("span", { style: "font-size: 13px; font-weight: 500;", text: t.name }),
          el("div", { style: "display: flex; gap: 4px;" }, [
            button("Use", () => {
              ctx.mutate(() => { 
                ctx.state.ui.specAnswers = JSON.parse(JSON.stringify(t.answers));
                ctx.state.ui.specScreen = 2;
              });
              ctx.requestRender();
            }, "ghost"),
            button("Export", () => {
              const json = specApi.serializeTemplate(t.answers);
              const blob = new Blob([json], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${t.name.replace(/\s+/g, '-').toLowerCase()}-template.json`;
              a.click();
              URL.revokeObjectURL(url);
            }, "ghost"),
            (() => {
              const b = button("×", async () => {
                await deleteUserTemplate(t.id);
                renderMyTemplates();
              }, "ghost", "Delete template");
              b.style.color = "red";
              return b;
            })()
          ])
        ]);
        myTemplatesContainer.appendChild(row);
      });
    };
    renderMyTemplates();

    // Import
    const importContainer = el("div", { style: "margin-top: 8px; padding: 8px; background: #f0f0f0; border-radius: 4px;" }, [
      el("div", { style: "font-size: 12px; font-weight: 500; margin-bottom: 4px;", text: "Import Template (JSON)" }),
      el("input", { type: "file", accept: ".json", style: "font-size: 11px;", on: { change: e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          const parsed = specApi.deserializeTemplate(event.target.result);
          if (parsed) {
            ctx.mutate(() => { 
              ctx.state.ui.specAnswers = parsed;
              ctx.state.ui.specScreen = 2;
            });
            ctx.requestRender();
          } else {
            alert("Invalid template JSON file.");
          }
        };
        reader.readAsText(file);
      }}})
    ]);

    const archetypeGrid = el("div", { style: "display: grid; grid-template-columns: 1fr 1fr; gap: 8px;" }, 
      Object.entries(specApi.ARCHETYPES).map(([key, info]) => 
        button(`${info.emoji} ${info.label}`, () => { ctx.mutate(() => { ctx.state.ui.specAnswers.archetype = key; ctx.requestRender(); }); }, ctx.state.ui.specAnswers.archetype === key ? "primary" : "ghost")
      )
    );

    const scaleGrid = el("div", { style: "display: grid; grid-template-columns: 1fr 1fr; gap: 8px;" },
      specApi.SCALES.map(scale => 
        el("label", { style: "display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;" }, [
          el("input", { type: "radio", name: "spec-scale", checked: ctx.state.ui.specAnswers.scale === scale, on: { change: () => { ctx.mutate(() => { ctx.state.ui.specAnswers.scale = scale; ctx.requestRender(); }); } } }),
          el("span", { text: scale.charAt(0).toUpperCase() + scale.slice(1) })
        ])
      )
    );

    const nextBtn = button("Next", () => {
      ctx.mutate(() => { ctx.state.ui.specScreen = 1; ctx.requestRender(); });
    }, "primary");

    return el("div", { style: "display: flex; flex-direction: column; gap: 12px;" }, [
      field("Quick Starts", quickStartRow),
      field("Name", nameInput),
      field("Description", descInput),
      field("App Type", archetypeGrid),
      field("Scale", scaleGrid),
      el("details", { style: "font-size: 13px;" }, [
        el("summary", { style: "cursor: pointer; font-weight: 500;", text: "My Saved Templates" }),
        myTemplatesContainer,
        importContainer
      ]),
      el("div", { className: "aisq-actions" }, [nextBtn])
    ]);
  }

  function renderWizardScreen1(specApi) {
    const inferred = specApi.inferDefaults(ctx.state.ui.specAnswers);
    const visible = specApi.getVisibleSections(inferred);
    
    const featureText = el("textarea", { className: "aisq-draft", style: "min-height: 80px;", value: ctx.state.ui.specAnswers.features || "", on: { input: e => { ctx.mutate(() => { ctx.state.ui.specAnswers.features = e.target.value }); } } });
    const suggestions = specApi.FEATURE_SUGGESTIONS[inferred.archetype] || [];
    const suggestionChips = el("div", { style: "display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;" }, suggestions.map(s => {
      const isSelected = ctx.state.ui.specAnswers.featureChips.includes(s);
      return el("button", { text: (isSelected ? "✓ " : "+ ") + s, style: `font-size: 11px; padding: 2px 6px; border: 1px solid #ccc; border-radius: 4px; background: ${isSelected ? '#e0f0ff' : 'transparent'}; cursor: pointer;`, on: { click: () => {
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

    // Design
    const genreSelect = el("select", { className: "aisq-select" }, [el("option", { value: "", text: "-- Select Genre --" }), ...Object.entries(specApi.GENRES).map(([id, info]) => el("option", { value: id, text: info.label, selected: inferred.genre === id }))]);
    genreSelect.addEventListener("change", e => { ctx.mutate(() => { ctx.state.ui.specAnswers.genre = e.target.value; }); ctx.requestRender(); });
    
    const mkCheckbox = (label, key) => el("label", { style: "display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;" }, [
      el("input", { type: "checkbox", checked: !!ctx.state.ui.specAnswers[key], on: { change: e => { ctx.mutate(() => { ctx.state.ui.specAnswers[key] = e.target.checked }); ctx.requestRender(); } } }),
      el("span", { text: label })
    ]);
    const designOptions = el("div", { style: "display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px;" }, [
      mkCheckbox("Mobile First", "mobileFirst"), mkCheckbox("Dark Mode", "darkMode"), mkCheckbox("Prod Quality", "productionQuality")
    ]);

    // Screens
    const screensValue = Array.isArray(ctx.state.ui.specAnswers.screens) ? ctx.state.ui.specAnswers.screens.join(", ") : (ctx.state.ui.specAnswers.screens || "");
    const screensInput = el("input", { className: "aisq-input", value: screensValue, placeholder: "Home, Login, Dashboard", on: { change: e => { ctx.mutate(() => { ctx.state.ui.specAnswers.screens = e.target.value.split(",").map(x => x.trim()).filter(Boolean) }); ctx.requestRender(); } } });

    const fields = [
      field("Core Features", el("div", {}, [featureText, suggestionChips])),
      field("Design", el("div", {}, [genreSelect, designOptions])),
      field("Screens", screensInput)
    ];

    if (visible.techStack) {
      const mkTechSelect = (label, key, options) => {
        const sel = el("select", { className: "aisq-select" }, [el("option", { value: "", text: `-- Select ${label} --` }), ...options.map(o => el("option", { value: o, text: o, selected: inferred[key] === o }))]);
        sel.addEventListener("change", e => { ctx.mutate(() => { ctx.state.ui.specAnswers[key] = e.target.value }); ctx.requestRender(); });
        return field(label, sel);
      };
      fields.push(el("div", { style: "display: grid; grid-template-columns: 1fr 1fr; gap: 8px;" }, [
        mkTechSelect("Frontend", "frontend", ["React", "Vue", "Svelte", "Vanilla JS", "Next.js 14 App Router", "Next.js", "Astro", "React Native", "Angular", "None"]),
        mkTechSelect("Backend", "backend", ["Node.js", "Node.js + Express", "Python", "Python + FastAPI", "Go", "Firebase", "Supabase", "Next.js API Routes", "Node.js + NestJS", "Java Spring Boot", "None"]),
        mkTechSelect("Database", "database", ["PostgreSQL", "PostgreSQL (Supabase)", "PostgreSQL (pgvector)", "MongoDB", "MySQL", "Redis", "Firestore", "None"]),
        mkTechSelect("Hosting", "hosting", ["Vercel", "Netlify", "AWS", "Render", "App Stores", "GitHub Pages"])
      ]));
      fields.push(field("Industry (optional)", el("input", {
        className: "aisq-input",
        value: ctx.state.ui.specAnswers.industry || "",
        placeholder: "e.g. Healthcare, Fintech, Education",
        on: { input: e => { ctx.mutate(() => { ctx.state.ui.specAnswers.industry = e.target.value }); } }
      })));
    }

    if (visible.security) {
      fields.push(field("Security Needs", el("input", { className: "aisq-input", value: ctx.state.ui.specAnswers.security || "", placeholder: "OAuth, E2E Encryption", on: { input: e => { ctx.mutate(() => { ctx.state.ui.specAnswers.security = e.target.value }); } } })));
    }

    return el("div", { style: "display: flex; flex-direction: column; gap: 12px;" }, [
      ...fields,
      el("div", { className: "aisq-actions" }, [
        button("Back", () => { ctx.mutate(() => { ctx.state.ui.specScreen = 0; ctx.requestRender(); }); }, "ghost"),
        button("Preview", () => { ctx.mutate(() => { ctx.state.ui.specScreen = 2; ctx.requestRender(); }); }, "primary")
      ])
    ]);
  }

  function renderWizardScreen2(specApi) {
    const inferred = specApi.inferDefaults(ctx.state.ui.specAnswers);
    const stages = specApi.resolveStages(inferred);
    const overrides = ctx.state.ui.specAnswers.stageOverrides;
    const result = specApi.assembleSpec(ctx.state.ui.specAnswers, overrides);
    
    if (ctx.state.ui.specRawView === undefined) ctx.state.ui.specRawView = false;
    
    const summary = el("p", { className: "aisq-copy", text: `${result.stageCount} stages, ~${result.charCount} characters` });
    const prefaceEl = el("pre", { style: "white-space: pre-wrap; font-size: 11px; background: #f0f0f0; padding: 8px; border-radius: 4px; max-height: 100px; overflow-y: auto;", text: result.preface });
    
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
      const body = el("div", { style: "padding: 8px; font-size: 11px; background: #f9f9f9; border-top: 1px solid #eee; white-space: pre-wrap;", text: previewText });
      
      return el("details", { style: "border: 1px solid #ccc; border-radius: 4px; padding: 4px 8px; margin-bottom: 4px;" }, [header, body]);
    });

    const rawToggle = el("label", { style: "display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;margin-bottom:8px;" }, [
      el("input", { type: "checkbox", checked: ctx.state.ui.specRawView, on: { change: e => {
        ctx.mutate(() => { ctx.state.ui.specRawView = e.target.checked; });
        ctx.requestRender();
      }}}),
      el("span", { text: "View Raw Text" })
    ]);

    const stagesOrRaw = ctx.state.ui.specRawView
      ? el("div", {}, [
          rawToggle,
          button("Copy to Clipboard", () => navigator.clipboard.writeText(result.preface + "\n\n" + result.raw), "ghost"),
          el("pre", { style: "white-space:pre-wrap;font-size:11px;background:#f0f0f0;padding:8px;border-radius:4px;max-height:300px;overflow-y:auto;margin-top:8px;", text: result.preface + "\n\n" + result.raw })
        ])
      : el("div", {}, [rawToggle, ...stageCards]);

    const submit = () => {
      const finalResult = specApi.assembleSpec(ctx.state.ui.specAnswers, overrides);
      const commandResult = importText(finalResult.raw, finalResult.strategy, { name: ctx.state.ui.specAnswers.name || "Generated App", preface: finalResult.preface });
      if (commandResult.ok) {
        ctx.mutate(() => { ctx.state.ui.specMode = "paste"; ctx.state.ui.specScreen = 0; ctx.state.ui.specAnswers = {}; });
        ctx.requestRender();
      } else {
        alert("Error: " + commandResult.error);
      }
    };
    
    const submitAndStart = () => {
      const finalResult = specApi.assembleSpec(ctx.state.ui.specAnswers, overrides);
      const commandResult = importText(finalResult.raw, finalResult.strategy, { name: ctx.state.ui.specAnswers.name || "Generated App", preface: finalResult.preface });
      if (commandResult.ok) {
        ctx.mutate(() => { 
          ctx.state.ui.specMode = "paste"; 
          ctx.state.ui.specScreen = 0; 
          ctx.state.ui.specAnswers = {}; 
          ctx.state.settings.activeTab = "prompts";
          ctx.state.uiIntent = { action: 'start', scope: 'stack' };
        });
        ctx.requestRender();
      } else {
        alert("Error: " + commandResult.error);
      }
    };

    let saveMode = false;
    const saveNameInput = el("input", { className: "aisq-input", placeholder: "Template name...", style: "display:none;width:140px;" });
    const saveBtn = button("Save as Template", async () => {
      if (!saveMode) {
        saveMode = true;
        saveNameInput.style.display = "";
        saveNameInput.focus();
      } else {
        const name = saveNameInput.value.trim();
        if (name) {
          await saveUserTemplate(name, ctx.state.ui.specAnswers);
          saveNameInput.value = "";
          saveNameInput.style.display = "none";
          saveMode = false;
          saveBtn.textContent = "✓ Saved!";
          setTimeout(() => { saveBtn.textContent = "Save as Template"; }, 2000);
        }
      }
    }, "ghost");

    return el("div", { style: "display: flex; flex-direction: column; gap: 12px;" }, [
      field("Summary", summary),
      field("Preface", prefaceEl),
      field("Stages", stagesOrRaw),
      el("div", { style: "display: flex; justify-content: flex-end; align-items: center; gap: 8px;" }, [saveNameInput, saveBtn]),
      el("div", { className: "aisq-actions" }, [
        button("Back", () => { ctx.mutate(() => { ctx.state.ui.specScreen = 1; ctx.requestRender(); }); }, "ghost"),
        button("Add to Queue", submit, "ghost"),
        button("Generate & Start ▶", submitAndStart, "primary")
      ])
    ]);
  }
  function chainCard(chain, index) {
    const counts = Core.chainCounts(chain);
    let status = counts.pending ? "running" : counts.queued === 0 ? "done" : "queued";
    const selected = ctx.state.selectedChainId === chain.id;
    const isActive = ctx.state.runner.activeChainId === chain.id;
    const isPaused = isActive && !ctx.state.runner.enabled;
    let highlightClass = "";
    if (isActive) highlightClass = isPaused ? " aisq-highlight-paused" : " aisq-highlight-running";
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
      button(ctx.state.stackOrder.includes(chain.id) ? "–" : "+", () => ctx.command(ctx.state.stackOrder.includes(chain.id) ? "REMOVE_CHAIN_FROM_STACK" : "ADD_CHAIN_TO_STACK", { chainId: chain.id }), "ghost", ctx.state.stackOrder.includes(chain.id) ? `Suspend ${chain.name}` : `Add ${chain.name} to stack`),
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
    if (!ctx.state.chains.length) {
      wrap.append(el("p", { className: "aisq-copy", text: "No chains yet. Paste a prompt pack in Build." }));
      return wrap;
    }
    for (const [index, id] of ctx.state.stackOrder.entries()) {
      const candidate = Core.getChainById(ctx.state, id);
      if (candidate) stack.append(chainCard(candidate, index));
    }
    const stored = ctx.state.chains.filter((candidate) => !ctx.state.stackOrder.includes(candidate.id));
    if (stored.length) {
      stack.append(el("div", { className: "aisq-help", text: "Stored but removed from stack" }));
      stored.forEach((candidate, index) => stack.append(chainCard(candidate, ctx.state.stackOrder.length + index)));
    }
    wrap.append(el("div", { className: "aisq-stack-title" }, [el("strong", { text: "Execution stack" }), el("span", { className: "aisq-copy", text: `${ctx.state.stackOrder.length} chain(s)` })]), stack);
    return wrap;
  }

  function renderPrompts() {
    const chain = ctx.selectedChain();
    const wrap = el("div", { className: "aisq-section" });
    if (!ctx.state.chains.length) {
      wrap.append(el("p", { className: "aisq-copy", text: "No chains yet. Paste a prompt pack in Build." }));
      return wrap;
    }
    if (!chain) {
      wrap.append(el("p", { className: "aisq-copy", text: "Select a chain from the Stack tab to inspect it." }));
      return wrap;
    }

    const select = el("select", { className: "aisq-select" });
    ctx.state.chains.forEach((candidate) => {
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
      placeholder: "Type a shared intro / preface here to prepend to your prompts before execution..."
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
      ? "Preface is currently enabled on all prompts in this chain. Click to exclude from all." 
      : "Click to enable preface on all prompts in this chain.";

    const prefaceBadge = el("span", { 
      className: `aisq-preface-badge ${hasPreface ? "" : "empty"}`, 
      text: hasPreface ? `${activePrefaceCount}/${chain.prompts.length} active · ${chain.preface.length}c` : "empty" 
    });

    const extractIntroBtn = !hasPreface
      ? button("⚡ Extract Intro", () => {
          ctx.command("EXTRACT_CHAIN_PREFACE", { chainId: chain.id });
        }, "ghost aisq-btn-extract", "Auto-extract shared intro from prompts into Preface")
      : null;

    const clearPreface = hasPreface
      ? button("Clear", () => {
          if (confirm("Clear preface text for this chain?")) ctx.command("EDIT_PREFACE", { chainId: chain.id, text: "" });
        }, "danger ghost")
      : null;

    const prefaceSummary = el("summary", { className: "aisq-prompt-head aisq-preface-head" }, [
      el("strong", { text: "Preface (Intro)" }),
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
        ? "No preface configured in Preface (Intro) above." 
        : (isIntroActive ? "Preface is currently prepended to this prompt. Click to turn off." : "Preface is excluded from this prompt. Click to turn on.");
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
      if (confirm(`Delete ${chain.name}? This removes its prompts.`)) ctx.command("DELETE_CHAIN", { chainId: chain.id }, { history: { kind: "chain_deleted", message: `Deleted ${chain.name}` } });
    }, "danger ghost");
    const duplicate = button("Duplicate chain", () => ctx.command("DUPLICATE_CHAIN", { chainId: chain.id }, { history: { kind: "chain_duplicated", message: `Duplicated ${chain.name}` } }), "ghost");
    const extractPrefaceBtn = button("Extract shared intro", () => {
      ctx.command("EXTRACT_CHAIN_PREFACE", { chainId: chain.id });
    }, "ghost", "Detect and extract repeating intro text from prompts into Preface (Intro)");
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
})(typeof globalThis !== "undefined" ? globalThis : this);