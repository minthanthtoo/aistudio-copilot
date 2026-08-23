(function initAISQUIDraftPlan(global) {
  "use strict";
  const Core = global.AISQCore;
  const ctx = global.AISQContext;
  const { el, button, field } = global.AISQUIUtils;

  const displayValue = (value) => {
    if (value && typeof value === "object" && value.kind === "custom") return value.label || value.raw || "Custom choice";
    if (Array.isArray(value)) return value.join(", ");
    if (value && typeof value === "object") return Object.entries(value).filter(([, item]) => item !== false).map(([key, item]) => `${key}: ${item}`).join(", ");
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value ?? "");
  };
  const hasDisplayValue = (value) => value !== undefined && value !== null && (typeof value === "boolean" || String(value).trim() !== "");

  const CUSTOM_VALUE = "__aisq_custom__";

  function decisionState(key, question, resolved, graphNode, focusId) {
    if (graphNode?.state) return graphNode.state;
    if (focusId === question.id || focusId === key) return "active";
    if (resolved.draft.dismissedQuestions?.[question.id]) return "dismissed";
    if (resolved.needsReview.some((item) => item.key === key)) return "review";
    const decision = resolved.draft.decisions?.[key];
    if (decision?.value && typeof decision.value === "object" && decision.value.kind === "custom") return "custom";
    if (decision?.status === "confirmed") return "confirmed";
    if (decision?.status === "proposed") return "proposed";
    if (!question.visibleWhen(resolved.answers)) return "locked";
    return "default";
  }

  function resolveConceptMap(resolved, plan) {
    const graph = resolved.graph || {};
    const focusId = graph.focusId || ctx.state.ui.planMapFocusId || resolved.activeQuestionId || resolved.questions[0]?.id || null;
    const availableQuestions = [...plan.QUESTIONS, ...(resolved.customQuestions || []), ...(resolved.omittedCustomQuestions || [])];
    const questionFor = (node) => availableQuestions.find((question) => question.id === (node.questionId || node.id) || question.answerKey === node.answerKey);
    const fallbackNodes = plan.QUESTIONS.map((question) => ({
      id: question.id,
      questionId: question.id,
      label: question.label,
      visible: question.visibleWhen?.(resolved.answers) !== false,
      locked: question.visibleWhen?.(resolved.answers) === false
    }));
    const nodes = (Array.isArray(graph.nodes) && graph.nodes.length ? graph.nodes : fallbackNodes).map((node) => {
      const question = questionFor(node);
      if (!question) return { ...node, state: node.state || "locked", question: null };
      return {
        ...node,
        id: node.id || question.id,
        label: node.label || question.label,
        visible: node.visible !== false,
        locked: node.locked === true || node.visible === false,
        question,
        state: node.state || decisionState(question.answerKey, question, resolved, node, focusId)
      };
    });
    const edges = Array.isArray(graph.treeEdges) && graph.treeEdges.length
      ? graph.treeEdges
      : Array.isArray(graph.edges) && graph.edges.length ? graph.edges : nodes.flatMap((node) => {
      const dependencies = resolved.dependencies[node.question?.answerKey] || [];
      return dependencies.slice(0, 1).map((key) => ({ from: availableQuestions.find((question) => question.answerKey === key)?.id || key, to: node.id }));
    });
    return { nodes, edges, focusId, readiness: graph.readiness || {}, progress: graph.progress || {}, omittedCustomBranches: graph.omittedCustomBranches || [] };
  }

  function renderConceptMap(resolved, plan) {
    const map = resolveConceptMap(resolved, plan);
    const required = map.readiness.required ?? resolved.requiredQuestionIds.length;
    const reviewCount = map.readiness.review ?? resolved.needsReview.length;
    const completed = map.progress.completed ?? Object.keys(resolved.draft.decisions || {}).length;
    const visibleCount = map.progress.total ?? map.nodes.filter((node) => node.visible && !node.locked).length;
    const percent = map.progress.percent ?? (visibleCount ? Math.round((completed / visibleCount) * 100) : 100);
    const readiness = map.readiness.label || (required
      ? `Needs ${required} required decision${required === 1 ? "" : "s"}`
      : reviewCount
        ? `Review ${reviewCount} affected decision${reviewCount === 1 ? "" : "s"}`
        : "Queue eligible with the shown assumptions");
    const byParent = new Map();
    for (const edge of map.edges) {
      if (!byParent.has(edge.from)) byParent.set(edge.from, []);
      byParent.get(edge.from).push(edge.to);
    }
    const nodeById = new Map(map.nodes.map((node) => [node.id, node]));
    const parents = new Set(map.edges.map((edge) => edge.to));
    const roots = map.nodes.filter((node) => !parents.has(node.id));
    const rendered = new Set();
    const renderNode = (node, seen = new Set(), level = 1) => {
      if (seen.has(node.id)) return null;
      if (rendered.has(node.id)) return null;
      rendered.add(node.id);
      const nextSeen = new Set(seen).add(node.id);
      const children = (byParent.get(node.id) || []).map((id) => nodeById.get(id)).filter(Boolean);
      const state = node.state || "default";
      const activate = () => {
        if (node.locked || !node.question) return;
        ctx.planFocusRequestKey = node.question.answerKey;
        ctx.mutate(() => {
          ctx.state.ui.planMapFocusId = node.id;
          ctx.state.ui.planDraft = plan.setActiveQuestion(ctx.state.ui.planDraft, node.question.id);
          Core.commitTransition(ctx.state, Core.EVENTS.PLAN_QUESTION_SHOWN, { questionId: node.question.id, source: "concept-map" });
        });
      };
      const nodeButton = button(`${state === "locked" ? "🔒" : state === "confirmed" ? "●" : state === "proposed" ? "◐" : state === "custom" ? "✦" : state === "review" ? "!" : state === "required" ? "?" : state === "dismissed" ? "–" : "○"} ${node.label}`, activate, map.focusId === node.id ? "primary" : "ghost", `${node.label}. ${state}${node.locked ? `. ${node.lockReason || "Locked until prerequisite decisions are available"}` : ". Select to focus"}`);
      nodeButton.disabled = !!node.locked;
      const item = el("li", { className: `aisq-plan-map-node is-${state}${node.locked ? " is-locked" : ""}`, attrs: { role: "treeitem", "aria-level": String(level), "aria-current": map.focusId === node.id ? "step" : undefined, "aria-disabled": node.locked ? "true" : undefined } }, [nodeButton]);
      const renderedChildren = children.map((child) => renderNode(child, nextSeen, level + 1)).filter(Boolean);
      if (renderedChildren.length) item.append(el("ol", { className: "aisq-plan-map-children", attrs: { role: "group" } }, renderedChildren));
      return item;
    };
    const list = el("ol", { className: "aisq-plan-map-tree", attrs: { role: "tree", "aria-label": "Decision map. Select a decision to focus it." } }, roots.map((node) => renderNode(node)).filter(Boolean));
    list.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const controls = Array.from(list.querySelectorAll("button:not(:disabled)"));
      if (!controls.length) return;
      const current = controls.indexOf(event.target.closest?.("button"));
      const nextIndex = event.key === "Home" ? 0
        : event.key === "End" ? controls.length - 1
          : event.key === "ArrowDown" ? Math.min(controls.length - 1, Math.max(0, current + 1))
            : Math.max(0, current <= 0 ? 0 : current - 1);
      event.preventDefault();
      controls[nextIndex].focus();
    });
    // A malformed future graph should still expose orphan nodes rather than hide decisions.
    for (const node of map.nodes) if (!rendered.has(node.id)) list.append(renderNode(node));
    return el("section", { className: "aisq-plan-map", attrs: { "aria-label": "Concept map progress" } }, [
      el("div", { className: "aisq-plan-map-heading" }, [
        el("strong", { text: "Decision map" }),
        el("small", { text: `${completed}/${visibleCount} addressed · ${percent}%` })
      ]),
      el("p", { className: "aisq-plan-map-readiness", text: readiness, attrs: { "aria-live": "polite" } }),
      el("progress", { attrs: { max: String(Math.max(1, visibleCount)), value: String(completed), "aria-label": `${completed} of ${visibleCount} visible decisions addressed` } }),
      list,
      map.omittedCustomBranches.length ? el("details", { className: "aisq-plan-map-omitted" }, [
        el("summary", { text: `${map.omittedCustomBranches.length} additional matching custom decision${map.omittedCustomBranches.length === 1 ? " uses" : "s use"} conservative assumptions` }),
        el("ul", {}, map.omittedCustomBranches.map((item) => el("li", { text: `${item.label}: ${displayValue(item.safeDefault)} · affects ${(item.affects || []).join(", ")}` })))
      ]) : null,
      el("small", { className: "aisq-plan-map-key", text: "● confirmed · ◐ suggested · ○ assumed · ? required · ! review · 🔒 locked · ✦ custom" })
    ]);
  }

  function setDecision(key, value, options = {}, render = true) {
    ctx.mutate(() => {
      const plan = global.AISQPlan;
      let nextDraft = plan.setDecision(ctx.state.ui.planDraft, key, value, options);
      let nextResolved = plan.resolveDraft(nextDraft, { specApi: global.AISQSpec });
      const nextQuestion = nextResolved.questions[0];
      if (nextQuestion) {
        nextDraft = plan.markQuestionShown(nextResolved.draft, nextQuestion.id);
        nextResolved = plan.resolveDraft(nextDraft, { specApi: global.AISQSpec });
        Core.commitTransition(ctx.state, Core.EVENTS.PLAN_QUESTION_SHOWN, { questionId: nextQuestion.id });
      }
      ctx.state.ui.planDraft = nextResolved.draft;
      ctx.state.ui.planMapFocusId = nextResolved.activeQuestionId;
      Core.commitTransition(ctx.state, Core.EVENTS.PLAN_QUESTION_ACCEPTED, { key });
    }, render);
  }

  function setCustomDecision(question, rawValue, canonicalValue) {
    ctx.mutate(() => {
      const plan = global.AISQPlan;
      let nextDraft = plan.setCustomChoice(ctx.state.ui.planDraft, question.answerKey, rawValue, canonicalValue);
      let nextResolved = plan.resolveDraft(nextDraft, { specApi: global.AISQSpec });
      const nextQuestion = nextResolved.questions[0];
      if (nextQuestion) {
        nextDraft = plan.markQuestionShown(nextResolved.draft, nextQuestion.id);
        nextResolved = plan.resolveDraft(nextDraft, { specApi: global.AISQSpec });
        Core.commitTransition(ctx.state, Core.EVENTS.PLAN_QUESTION_SHOWN, { questionId: nextQuestion.id });
      }
      ctx.state.ui.planDraft = nextResolved.draft;
      ctx.state.ui.planMapFocusId = nextResolved.activeQuestionId;
      ctx.state.ui.planCustomEditingKey = null;
      Core.commitTransition(ctx.state, Core.EVENTS.PLAN_QUESTION_ACCEPTED, { key: question.answerKey, custom: true });
    });
  }

  function questionControl(question, resolved, questions, graph = {}) {
    const rawValue = resolved.explicit[question.answerKey] ?? resolved.answers[question.answerKey] ?? "";
    const detailKey = question.customDetailKey;
    const customDetail = detailKey ? resolved.explicit[detailKey] || "" : "";
    const isCustom = !!customDetail;
    const customEditing = ctx.state.ui.planCustomEditingKey === question.answerKey;
    const value = isCustom || customEditing ? CUSTOM_VALUE : rawValue;
    let control;
    if (question.inputType === "select") {
      control = el("select", { className: "aisq-select", attrs: { "data-plan-key": question.answerKey } });
      control.append(el("option", { value: "", text: "Choose an option…", selected: !rawValue && !isCustom }));
      for (const option of question.options) control.append(el("option", { value: option, text: option, selected: value === option }));
      if (question.allowCustom) control.append(el("option", { value: CUSTOM_VALUE, text: "Other / custom…", selected: isCustom }));
    } else if (question.inputType === "boolean") {
      control = el("input", { type: "checkbox", checked: value === true, attrs: { "data-plan-key": question.answerKey } });
    } else {
      control = el(question.inputType === "textarea" ? "textarea" : "input", {
        className: question.inputType === "textarea" ? "aisq-draft" : "aisq-input",
        value: value === undefined ? "" : value,
        placeholder: question.inputType === "textarea" ? "Describe the essential outcome…" : "Type an answer…",
        attrs: { "data-plan-key": question.answerKey }
      });
      if (question.inputType === "textarea") control.style.minHeight = "58px";
    }
    const commit = () => {
      const nextValue = question.inputType === "boolean" ? control.checked : control.value;
      if (nextValue === CUSTOM_VALUE) return;
      if (!nextValue && question.inputType !== "boolean") return;
      if (question.allowCustom) {
        ctx.mutate(() => {
          const next = global.AISQPlan.clearCustomChoice(ctx.state.ui.planDraft, question.answerKey, nextValue);
          ctx.state.ui.planDraft = global.AISQPlan.resolveDraft(next, { specApi: global.AISQSpec }).draft;
          ctx.state.ui.planCustomEditingKey = null;
          Core.commitTransition(ctx.state, Core.EVENTS.PLAN_QUESTION_ACCEPTED, { key: question.answerKey });
        }, false);
      } else {
        setDecision(question.answerKey, nextValue, {}, false);
      }
    };
    control.addEventListener("change", () => {
      if (control.value === CUSTOM_VALUE) {
        ctx.planCustomFocusRequestKey = question.answerKey;
        ctx.mutate(() => { ctx.state.ui.planCustomEditingKey = question.answerKey; });
        control.blur();
        setTimeout(() => ctx.requestRender(true), 0);
        return;
      }
      if (ctx.state.ui.planCustomEditingKey === question.answerKey) ctx.mutate(() => { ctx.state.ui.planCustomEditingKey = null; });
      commit();
    });
    control.addEventListener("blur", () => ctx.requestRender(true));
    if (question.inputType === "boolean") control.addEventListener("input", commit);
    const required = resolved.requiredQuestionIds.includes(question.id);
    const skip = required ? el("small", { className: "aisq-plan-required-note", text: "Required: choose a safe value before this plan can be queued." }) : button(`Skip · use ${displayValue(resolved.answers[question.answerKey])}`, () => {
      ctx.mutate(() => {
        const plan = global.AISQPlan;
        let nextDraft = plan.dismissQuestion(ctx.state.ui.planDraft, question.id);
        let nextResolved = plan.resolveDraft(nextDraft, { specApi: global.AISQSpec });
        const nextQuestion = nextResolved.questions[0];
        if (nextQuestion) {
          nextDraft = plan.markQuestionShown(nextResolved.draft, nextQuestion.id);
          nextResolved = plan.resolveDraft(nextDraft, { specApi: global.AISQSpec });
          Core.commitTransition(ctx.state, Core.EVENTS.PLAN_QUESTION_SHOWN, { questionId: nextQuestion.id });
        }
        ctx.state.ui.planDraft = nextResolved.draft;
        ctx.state.ui.planMapFocusId = nextResolved.activeQuestionId;
        Core.commitTransition(ctx.state, Core.EVENTS.PLAN_QUESTION_SKIPPED, { questionId: question.id });
        Core.commitTransition(ctx.state, Core.EVENTS.PLAN_QUESTION_DISMISSED, { questionId: question.id, ruleVersion: question.ruleVersion || "1" });
      });
    }, "ghost", `Skip ${question.label} and use the shown assumption`);
    const continueButton = button("Accept shown value & continue", () => {
      if (question.allowCustom && (control.value === CUSTOM_VALUE || customEditing)) {
        ctx.toast("Complete or cancel the custom choice before continuing.", "error");
        return;
      }
      const shownValue = question.inputType === "boolean" ? control.checked : (control.value || resolved.answers[question.answerKey] || question.safeDefault);
      if (!hasDisplayValue(shownValue)) {
        ctx.toast("Enter a value or explicitly skip this decision.", "error");
        return;
      }
      setDecision(question.answerKey, shownValue);
    }, "primary");
    const children = [field(question.label, control, question.reason)];
    if (question.allowCustom && (isCustom || customEditing)) {
      const customRaw = el("input", { className: "aisq-input", value: customDetail, placeholder: "Describe the custom choice…", attrs: { "data-plan-custom-raw": question.answerKey } });
      const canonical = el("select", { className: "aisq-select", attrs: { "data-plan-custom-profile": question.answerKey } }, [
        el("option", { value: "", text: "Choose a compatible build profile…" }),
        ...question.options.map((option) => el("option", { value: option, text: option, selected: rawValue === option }))
      ]);
      const useCustom = button("Use custom path", () => {
        if (!customRaw.value.trim() || !canonical.value) {
          ctx.toast("Describe the custom choice and select a compatible build profile.", "error");
          return;
        }
        customRaw.blur();
        setCustomDecision(question, customRaw.value.trim(), canonical.value);
      }, "primary", `Use custom ${question.label}`);
      children.push(el("div", { className: "aisq-plan-custom-choice" }, [
        field("Your custom choice", customRaw),
        field("Compatible build profile", canonical, "The profile guides existing generators while your original wording remains visible."),
        useCustom
      ]));
    }
    children.push(el("div", { className: "aisq-plan-question-actions" }, [skip, continueButton]));
    return el("div", { className: "aisq-plan-question" }, children);
  }

  function focusDecision(questionId) {
    ctx.mutate(() => {
      ctx.state.ui.planDraft = global.AISQPlan.setActiveQuestion(ctx.state.ui.planDraft, questionId);
      ctx.state.ui.planMapFocusId = questionId;
      Core.commitTransition(ctx.state, Core.EVENTS.PLAN_QUESTION_SHOWN, { questionId, source: "review" });
    });
  }

  function summaryList(title, entries, className = "", resolved = null, plan = null) {
    const rows = entries.length
      ? entries.map(([key, value]) => {
        const node = resolved?.graph?.nodes?.find((item) => item.answerKey === key);
        const question = node && [...(plan?.QUESTIONS || []), ...(resolved?.customQuestions || []), ...(resolved?.omittedCustomQuestions || [])].find((item) => item.id === node.questionId);
        return el("li", {}, [
          el("span", { text: `${key}: ${displayValue(value)}` }),
          question ? button("Change", () => focusDecision(question.id), "ghost", `Change ${question.label}`) : null
        ]);
      })
      : [el("li", { text: "Nothing recorded yet." })];
    return el("section", { className: `aisq-plan-summary ${className}`.trim(), attrs: { "aria-label": title } }, [
      el("strong", { text: title }),
      el("ul", {}, rows)
    ]);
  }

  function approvePlan(run) {
    if (ctx.__planApprovalBusy) return { ok: false, error: "Plan approval is already in progress" };
    const plan = global.AISQPlan;
    const specApi = global.AISQSpec;
    const latest = plan.resolveDraft(ctx.state.ui.planDraft, { specApi });
    if (latest.requiredQuestionIds.length) {
      ctx.toast("Answer or dismiss the highlighted consequential questions before approval.", "error");
      return { ok: false, error: "Required plan decisions remain" };
    }
    if (latest.needsReview.length) {
      ctx.toast("Review the affected decisions before approval.", "error");
      return { ok: false, error: "Affected plan decisions need review" };
    }
    ctx.__planApprovalBusy = true;
    let completed = false;
    try {
      const approvedDraft = plan.approveProposals(latest.draft);
      const approved = plan.resolveDraft(approvedDraft, { specApi });
      const result = specApi.assembleSpec(approved.generatedAnswers, approved.generatedAnswers.stageOverrides || {});
      const parsed = Core.parsePromptPack(result.raw, result.strategy);
      const chain = Core.makeChain(approved.generatedAnswers.name || "Generated App", parsed.prompts, result.raw, {
        splitStrategy: parsed.strategy,
        preface: result.preface
      });
      let commitId = ctx.state.ui.pendingPlanCommitId;
      if (!commitId) {
        commitId = Core.uid("plan-commit");
        ctx.mutate(() => { ctx.state.ui.pendingPlanCommitId = commitId; }, false);
      }
      const imported = ctx.command("APPROVE_PLAN_IMPORT", {
        chain,
        commitId,
        planFingerprint: plan.approvalFingerprint(latest.draft, { specApi }),
        run,
        placement: ctx.state.settings.pastePlacement === "end" ? "bottom" : "after",
        afterChainId: ctx.state.settings.pastePlacement === "end" ? null : ctx.state.selectedChainId
      }, { history: { kind: "plan_approved", message: "Approved Draft Plan and added one chain" } });
      if (imported.ok) {
        completed = true;
        ctx.requestRender(true);
      }
      return imported;
    } catch (error) {
      ctx.toast(`Could not approve plan: ${error.message}`, "error");
      return { ok: false, error: error.message };
    } finally {
      if (!completed) ctx.__planApprovalBusy = false;
    }
  }

  function renderDraftPlanDetails() {
    const plan = global.AISQPlan;
    const specApi = global.AISQSpec;
    if (!ctx.state.ui.planDraft) {
      ctx.state.ui.planDraft = plan.createDraft("user", ctx.state.ui.specAnswers || {});
    }
    const resolved = plan.resolveDraft(ctx.state.ui.planDraft, { specApi });
    const explicitEntries = Object.entries(resolved.draft.decisions || {})
      .filter(([, decision]) => decision?.status === "confirmed")
      .map(([key, decision]) => [key, decision.value]);
    const proposedDecisions = Object.entries(resolved.draft.decisions || {})
      .filter(([, decision]) => decision?.status === "proposed")
      .map(([key, decision]) => [key, decision.value]);
    const proposedKeys = new Set(proposedDecisions.map(([key]) => key));
    const computedProposals = Object.entries(resolved.defaults).filter(([key, value]) => !proposedKeys.has(key) && value !== undefined && value !== null && value !== "");
    const proposedEntries = [...proposedDecisions, ...computedProposals];
    const stages = (resolved.stageSelection || []).map((stage) => el("li", { text: stage.title || stage.id || "Generated stage" }));
    const conceptMap = resolveConceptMap(resolved, plan);
    const mapFocusQuestion = conceptMap.nodes.find((node) => node.id === conceptMap.focusId)?.question;
    const activeQuestion = mapFocusQuestion && mapFocusQuestion.visibleWhen?.(resolved.answers) !== false
      ? mapFocusQuestion
      : resolved.questions.find((question) => question.id === resolved.activeQuestionId) || resolved.questions[0];
    const shownIndex = (resolved.draft.shownQuestionIds || []).indexOf(activeQuestion?.id);
    if (activeQuestion && ctx.planFocusRequestKey === activeQuestion.answerKey) {
      const focusKey = activeQuestion.answerKey;
      ctx.planFocusRequestKey = null;
      setTimeout(() => {
        const target = Array.from(ctx.shadow?.querySelectorAll?.("[data-plan-key]") || []).find((control) => control.getAttribute("data-plan-key") === focusKey);
        target?.focus();
      }, 0);
    }
    if (activeQuestion && ctx.planCustomFocusRequestKey === activeQuestion.answerKey) {
      const focusKey = activeQuestion.answerKey;
      ctx.planCustomFocusRequestKey = null;
      setTimeout(() => {
        const target = Array.from(ctx.shadow?.querySelectorAll?.("[data-plan-custom-raw]") || []).find((control) => control.getAttribute("data-plan-custom-raw") === focusKey);
        target?.focus();
      }, 0);
    }
    const needed = activeQuestion
      ? [el("small", { className: "aisq-plan-question-count", text: shownIndex >= 0 ? `Clarification ${shownIndex + 1} of ${plan.QUESTION_LIMIT}` : "Decision selected from the map" }), questionControl(activeQuestion, resolved, resolved.questions, resolved.graph || {})]
      : [el("div", { className: "aisq-plan-empty", text: "No clarification is required before review." })];
    const availableQuestions = [...plan.QUESTIONS, ...(resolved.customQuestions || []), ...(resolved.omittedCustomQuestions || [])];
    const proposalReview = proposedEntries.map(([key, value]) => {
      const decision = resolved.draft.decisions?.[key];
      const question = availableQuestions.find((item) => item.answerKey === key);
      const affected = (resolved.effects[key] || []).join(", ") || "generated output";
      const provenance = decision ? `${decision.source} ${decision.status}` : "computed assumption";
      return el("li", { text: `${key}: ${displayValue(value)} · ${provenance} · affects ${affected}${question ? ` · ${question.reason}` : ""}` });
    });
    const review = [...proposalReview, ...resolved.needsReview.map((item) => el("li", { text: `${item.key}: ${item.reason}` }))];
    if (!review.length) review.push(el("li", { text: "No upstream changes need review." }));
    let saveMode = false;
    const saveNameInput = el("input", { className: "aisq-input", placeholder: "Template name...", style: "display:none;max-width:180px;" });
    const save = async () => {
      if (!saveMode) {
        saveMode = true;
        saveNameInput.style.display = "";
        saveNameInput.focus();
        return;
      }
      const latest = plan.resolveDraft(ctx.state.ui.planDraft, { specApi });
      const name = saveNameInput.value.trim() || latest.generatedAnswers.name || "Generated App";
      await ctx.saveUserTemplate(name, latest.generatedAnswers);
      saveNameInput.value = "";
      saveNameInput.style.display = "none";
      saveMode = false;
      ctx.toast(`✅ Saved ${name} template`, "success");
    };

    return el("div", { className: "aisq-section aisq-draft-plan" }, [
      el("div", { style: "display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;" }, [
        button("← Back", () => { ctx.mutate(() => { ctx.state.ui.buildView = "input"; }); }, "ghost"),
        el("strong", { text: "Draft Plan · App Wizard" }),
        el("span", { className: "aisq-plan-confidence", text: `${Math.round(resolved.decisionCoverage * 100)}% decisions addressed` })
      ]),
      el("div", { className: "aisq-plan-hero" }, [
        el("strong", { text: resolved.answers.name || "Untitled app" }),
        el("p", { text: resolved.answers.description || "Describe the outcome this app should deliver." }),
        el("small", { text: `${resolved.stageSelection.length || "Auto"} stage plan · ${resolved.questions.length} clarification${resolved.questions.length === 1 ? "" : "s"}` })
      ]),
      renderConceptMap(resolved, plan),
      summaryList("You chose", explicitEntries, "", resolved, plan),
      summaryList("Suggested", proposedEntries, "aisq-plan-suggested", resolved, plan),
      el("section", { className: "aisq-plan-section", attrs: { "aria-label": "Still needed" } }, [
        el("strong", { text: "Still needed" }),
        ...needed
      ]),
      el("section", { className: "aisq-plan-section", attrs: { "aria-label": "Needs review" } }, [
        el("strong", { text: "Needs review" }),
        el("ul", {}, review)
      ]),
      el("section", { className: "aisq-plan-section", attrs: { "aria-label": "Stage outline" } }, [
        el("strong", { text: "Stage outline" }),
        el("ol", {}, stages.length ? stages : [el("li", { text: "Stages will be selected from the approved decisions." })])
      ]),
      el("div", { className: "aisq-actions aisq-plan-actions" }, [
        saveNameInput,
        button("Save as Template", save, "ghost"),
        button("Approve assumptions & Add to Queue", () => approvePlan(false), "ghost"),
        button("Approve assumptions & Run (Generate & Run ▶)", () => approvePlan(true), "primary")
      ])
    ]);
  }

  Object.assign(ctx, { renderDraftPlanDetails, approvePlan });
})(typeof globalThis !== "undefined" ? globalThis : this);
