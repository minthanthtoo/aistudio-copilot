(function initAISQUIWizard(global) {
  "use strict";
  const Core = global.AISQCore;
  const ctx = global.AISQContext;
  const { el, button, field } = global.AISQUIUtils;

  function syncWizardDecision(key, value, render = false) {
    ctx.mutate(() => {
      ctx.state.ui.specAnswers[key] = value;
      ctx.state.ui.planDraft = global.AISQPlan.setDecision(ctx.state.ui.planDraft, key, value);
    }, render);
  }

  function renderWizardDetails() {
    const specApi = globalThis.AISQSpec;
    if (!ctx.state.ui.planDraft) {
      ctx.state.ui.planDraft = global.AISQPlan.createDraft("legacy", ctx.state.ui.specAnswers || {});
    }
    const inferred = specApi.inferDefaults(ctx.state.ui.specAnswers);
    const visible = specApi.getVisibleSections(inferred);
    ctx.state.ui.specAnswers.featureChips = ctx.state.ui.specAnswers.featureChips || [];
    ctx.state.ui.specAnswers.stageOverrides = ctx.state.ui.specAnswers.stageOverrides || {};
    
    const stages = specApi.resolveStages(inferred);
    const overrides = ctx.state.ui.specAnswers.stageOverrides;
    const result = specApi.assembleSpec(ctx.state.ui.specAnswers, overrides);
    
    const parsed = Core.parsePromptPack(result.raw, result.strategy);
    const promptCount = parsed.prompts.length;

    const stackSummary = [inferred.frontend, inferred.backend, inferred.database].filter(x => x && x !== "None" && x !== "__custom__").join(" + ") || "No stack specified";
    
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
    ]);

    const nameInput = el("input", { className: "aisq-input", value: ctx.state.ui.specAnswers.name || "", placeholder: "My App", on: { keydown: e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (e.shiftKey) submitAndStart(); else submit(); } }, input: e => { syncWizardDecision("name", e.target.value, false); }, change: () => { ctx.requestRender(); } } });
    const descInput = el("textarea", { className: "aisq-draft", style: "min-height: 60px;", value: ctx.state.ui.specAnswers.description || "", placeholder: "A to-do app...", on: { keydown: e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (e.shiftKey) submitAndStart(); else submit(); } }, input: e => { syncWizardDecision("description", e.target.value, false); }, change: () => { ctx.requestRender(); } } });
    
    const featureText = el("textarea", { className: "aisq-draft", style: "min-height: 80px;", value: ctx.state.ui.specAnswers.features || "", on: { keydown: e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (e.shiftKey) submitAndStart(); else submit(); } }, input: e => { syncWizardDecision("features", e.target.value, false); }, change: () => { ctx.requestRender(); } } });
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
          ctx.state.ui.planDraft = global.AISQPlan.setDecision(ctx.state.ui.planDraft, "featureChips", ctx.state.ui.specAnswers.featureChips);
        });
        ctx.requestRender();
      }} });
    }));

    const mkTechSelect = (label, key, options) => {
      const val = inferred[key] || "";
      const isCustom = val === "__custom__" || (val !== "" && val !== "None" && !options.includes(val));
      const displayVal = val === "__custom__" ? "" : val;
      
      const sel = el("select", { className: "aisq-select", style: "width: 100%;" }, [
        el("option", { value: "", text: `-- Select ${label} --` }),
        ...options.map(o => el("option", { value: o, text: o, selected: val === o })),
        el("option", { value: "__custom__", text: "Other (Type...)", selected: isCustom })
      ]);
      
      const customInput = el("input", { 
        className: "aisq-input", 
        type: "text", 
        placeholder: `Type custom ${label.toLowerCase()}...`, 
        value: isCustom ? displayVal : "",
        style: isCustom ? "display: block; width: 100%; margin-top: 6px;" : "display: none;"
      });

      sel.addEventListener("change", e => {
        const v = e.target.value;
        if (v === "__custom__") {
          syncWizardDecision(key, v, false);
          customInput.style.display = "block";
          customInput.value = "";
          sel.blur();
          setTimeout(() => customInput.focus(), 30);
        } else {
          syncWizardDecision(key, v, false);
          customInput.style.display = "none";
          customInput.value = "";
          sel.blur();
          setTimeout(() => ctx.requestRender(), 50);
        }
      });

      customInput.addEventListener("input", e => {
        syncWizardDecision(key, e.target.value || "__custom__", false);
      });
      
      customInput.addEventListener("change", e => {
        syncWizardDecision(key, e.target.value || "__custom__", false);
        customInput.blur();
        setTimeout(() => ctx.requestRender(), 50);
      });

      return field(label, el("div", {}, [sel, customInput]));
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
        ctx.mutate(() => {
          ctx.state.ui.specAnswers.stageOverrides[s.id] = e.target.checked;
          ctx.state.ui.planDraft = global.AISQPlan.setDecision(ctx.state.ui.planDraft, "stageOverrides", ctx.state.ui.specAnswers.stageOverrides);
        });
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
      if (ctx.shadow?.activeElement?.blur) ctx.shadow.activeElement.blur();
      const commandResult = ctx.approvePlan(false);
      if (!commandResult.ok && /review|required/i.test(commandResult.error || "")) ctx.mutate(() => { ctx.state.ui.buildView = "plan_details"; });
    };
    
    const submitAndStart = () => {
      if (ctx.shadow?.activeElement?.blur) ctx.shadow.activeElement.blur();
      const commandResult = ctx.approvePlan(true);
      if (!commandResult.ok && /review|required/i.test(commandResult.error || "")) ctx.mutate(() => { ctx.state.ui.buildView = "plan_details"; });
    };

    return el("div", { className: "aisq-section" }, [
      el("div", { style: "display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;" }, [
        button("← Back", () => { ctx.mutate(() => { ctx.state.ui.buildView = "input"; }); ctx.requestRender(); }, "ghost"),
        el("strong", { text: "App Wizard" })
      ]),
      previewCard,
      (() => {
        const mkProfileSelect = (label, key, options) => {
          const detailKey = key === "archetype" ? "archetypeDetail" : "scaleDetail";
          const customEditing = ctx.state.ui.fullWizardCustomEditingKey === key;
          const detail = ctx.state.ui.specAnswers[detailKey] || "";
          const isCustom = !!detail || customEditing;
          const sel = el("select", { className: "aisq-select", attrs: { "data-wizard-profile": key } }, [
            ...options.map((option) => el("option", { value: option.value, text: option.text, selected: !isCustom && inferred[key] === option.value })),
            el("option", { value: "__custom__", text: "Other / custom…", selected: isCustom })
          ]);
          sel.addEventListener("change", event => {
            const value = event.target.value;
            if (value === "__custom__") {
              ctx.fullWizardCustomFocusRequestKey = key;
              ctx.mutate(() => { ctx.state.ui.fullWizardCustomEditingKey = key; });
              sel.blur();
              setTimeout(() => ctx.requestRender(true), 0);
              return;
            }
            ctx.mutate(() => {
              const next = global.AISQPlan.clearCustomChoice(ctx.state.ui.planDraft, key, value);
              const resolved = global.AISQPlan.resolveDraft(next, { specApi });
              ctx.state.ui.planDraft = resolved.draft;
              ctx.state.ui.specAnswers = resolved.generatedAnswers;
              ctx.state.ui.fullWizardCustomEditingKey = null;
            });
            sel.blur();
            setTimeout(() => ctx.requestRender(true), 0);
          });
          const children = [sel];
          if (isCustom) {
            const customRaw = el("input", { className: "aisq-input", value: detail, placeholder: `Describe the custom ${label.toLowerCase()}…`, attrs: { "data-wizard-custom-raw": key } });
            if (ctx.fullWizardCustomFocusRequestKey === key) {
              ctx.fullWizardCustomFocusRequestKey = null;
              setTimeout(() => customRaw.focus(), 0);
            }
            const canonical = el("select", { className: "aisq-select", attrs: { "data-wizard-custom-canonical": key } }, [
              el("option", { value: "", text: "Choose the closest delivery profile…" }),
              ...options.map((option) => el("option", { value: option.value, text: option.text, selected: inferred[key] === option.value }))
            ]);
            const apply = button("Apply custom path", () => {
              if (!customRaw.value.trim() || !canonical.value) {
                ctx.toast("Describe the custom choice and select its compatible profile.", "error");
                return;
              }
              customRaw.blur();
              const next = global.AISQPlan.setCustomChoice(ctx.state.ui.planDraft, key, customRaw.value.trim(), canonical.value);
              ctx.mutate(() => {
                const resolved = global.AISQPlan.resolveDraft(next, { specApi });
                ctx.state.ui.planDraft = resolved.draft;
                ctx.state.ui.specAnswers = resolved.generatedAnswers;
                ctx.state.ui.fullWizardCustomEditingKey = null;
              });
            }, "primary");
            children.push(el("div", { className: "aisq-plan-custom-choice" }, [
              field("Your wording", customRaw),
              field("Compatible build profile", canonical, "This explicit mapping controls stages and risk gates."),
              apply
            ]));
          }
          return field(label, el("div", {}, children));
        };
        const archOptions = Object.entries(specApi.ARCHETYPES).map(([k, v]) => ({ value: k, text: `${v.emoji} ${v.label}` }));
        const scaleOptions = specApi.SCALES.map(s => ({ value: s, text: s.charAt(0).toUpperCase() + s.slice(1) }));
        return el("div", { style: "display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;" }, [
          mkProfileSelect("App Type", "archetype", archOptions),
          mkProfileSelect("Project Size / Delivery Profile", "scale", scaleOptions)
        ]);
      })(),
      field("Name", nameInput),
      field("Description", descInput),
      field("Features", el("div", {}, [featureText, suggestionChips])),
      techStackFields ? field("Tech Stack", techStackFields) : null,
      (visible.audience ? field("Target Audience", el("input", { className: "aisq-input", value: ctx.state.ui.specAnswers.audience || "", placeholder: "e.g. Developers, Small Business Owners", on: { input: e => { syncWizardDecision("audience", e.target.value, false); } } })) : null),
      (visible.industry ? field("Industry / Domain", el("input", { className: "aisq-input", value: ctx.state.ui.specAnswers.industry || "", placeholder: "e.g. Healthcare, Fintech, Education", on: { input: e => { syncWizardDecision("industry", e.target.value, false); } } })) : null),
      (visible.security ? field("Security Needs", el("input", { className: "aisq-input", value: ctx.state.ui.specAnswers.security || "", placeholder: "OAuth, E2E Encryption, RBAC", on: { input: e => { syncWizardDecision("security", e.target.value, false); } } })) : null),

      
      el("details", { style: "margin-top: 16px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 8px;" }, [
        el("summary", { style: "cursor: pointer; font-weight: 600; outline: none;", text: "Review Stages & Text" }),
        el("div", { style: "margin-top: 12px;" }, stageCards),
        el("div", { style: "display: flex; justify-content: flex-end; margin-top: 8px;" }, [
          button("📋 Copy to Clipboard", () => navigator.clipboard.writeText((result.preface ? result.preface + "\n\n" : "") + result.raw), "ghost")
        ]),

        el("pre", { style: "white-space: pre-wrap; font-size: 10px; background: rgba(0,0,0,0.3); padding: 8px; max-height: 200px; overflow: auto; margin-top: 12px;", text: (result.preface ? result.preface + "\n\n" : "") + result.raw })
      ]),

      
      (() => {
        let saveMode = false;
        const saveNameInput = el("input", { className: "aisq-input", placeholder: "Template name...", style: "display:none;width:140px;" });
        const saveBtn = button("💾 Save as Template", async () => {
          if (!saveMode) {
            saveMode = true;
            saveNameInput.style.display = "";
            saveNameInput.focus();
          } else {
            const name = saveNameInput.value.trim();
            if (name) {
              const latest = global.AISQPlan.resolveDraft(ctx.state.ui.planDraft, { specApi });
              await ctx.saveUserTemplate(name, latest.generatedAnswers);
              saveNameInput.value = "";
              saveNameInput.style.display = "none";
              saveMode = false;
              saveBtn.textContent = "✓ Saved!";
              setTimeout(() => { saveBtn.textContent = "💾 Save as Template"; }, 2000);
            }
          }
        }, "ghost");
        return el("div", { style: "display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 16px;" }, [saveNameInput, saveBtn]);
      })(),

      el("div", { className: "aisq-actions", style: "margin-top: 8px;" }, [
        button("Review Concept Map", () => { ctx.mutate(() => { ctx.state.ui.buildView = "plan_details"; }); }, "ghost"),
        button("Add to Queue", submit, "ghost"),
        button("Generate & Run ▶", submitAndStart, "primary")
      ])
    ]);
  }

  Object.assign(ctx, { renderWizardDetails });
})(typeof globalThis !== "undefined" ? globalThis : this);
