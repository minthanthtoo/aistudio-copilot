(function initAISQUIDraftPlan(global) {
  "use strict";
  const Core = global.AISQCore;
  const ctx = global.AISQContext;
  const { el, button, field } = global.AISQUIUtils;

  const displayValue = (value) => {
    if (Array.isArray(value)) return value.join(", ");
    if (value && typeof value === "object") return Object.entries(value).filter(([, item]) => item !== false).map(([key, item]) => `${key}: ${item}`).join(", ");
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value ?? "");
  };

  function setDecision(key, value, options = {}) {
    ctx.mutate(() => {
      const nextDraft = global.AISQPlan.setDecision(ctx.state.ui.planDraft, key, value, options);
      const nextResolved = global.AISQPlan.resolveDraft(nextDraft, { specApi: global.AISQSpec });
      nextDraft.activeQuestionId = nextResolved.questions.find((question) => question.id !== key)?.id || null;
      ctx.state.ui.planDraft = nextDraft;
      Core.commitTransition(ctx.state, Core.EVENTS.PLAN_QUESTION_ACCEPTED, { key });
    });
  }

  function questionControl(question, resolved, questions) {
    const value = resolved.explicit[question.answerKey] ?? resolved.answers[question.answerKey] ?? "";
    let control;
    if (question.inputType === "select") {
      control = el("select", { className: "aisq-select", attrs: { "data-plan-key": question.answerKey } });
      control.append(el("option", { value: "", text: "Choose an option…", selected: !resolved.explicit[question.answerKey] }));
      for (const option of question.options) control.append(el("option", { value: option, text: option, selected: value === option }));
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
      if (!nextValue && question.inputType !== "boolean") return;
      setDecision(question.answerKey, nextValue);
    };
    control.addEventListener("change", commit);
    if (question.inputType === "boolean") control.addEventListener("input", commit);
    const skip = button(`Skip · use ${displayValue(resolved.answers[question.answerKey])}`, () => {
      ctx.mutate(() => {
        const nextDraft = global.AISQPlan.dismissQuestion(ctx.state.ui.planDraft, question.id);
        const nextResolved = global.AISQPlan.resolveDraft(nextDraft, { specApi: global.AISQSpec });
        nextDraft.activeQuestionId = nextResolved.questions[0]?.id || null;
        ctx.state.ui.planDraft = nextDraft;
        Core.commitTransition(ctx.state, Core.EVENTS.PLAN_QUESTION_SKIPPED, { questionId: question.id });
        Core.commitTransition(ctx.state, Core.EVENTS.PLAN_QUESTION_DISMISSED, { questionId: question.id, ruleVersion: "1" });
      });
    }, "ghost", `Skip ${question.label}`);
    const continueButton = button("Continue", () => {
      const index = questions.findIndex((item) => item.id === question.id);
      ctx.mutate(() => {
        ctx.state.ui.planDraft.activeQuestionId = questions[index + 1]?.id || null;
      });
    }, "primary");
    return el("div", { className: "aisq-plan-question" }, [field(question.label, control, question.reason), el("div", { className: "aisq-plan-question-actions" }, [skip, continueButton])]);
  }

  function summaryList(title, entries, className = "") {
    const rows = entries.length
      ? entries.map(([key, value]) => el("li", { text: `${key}: ${displayValue(value)}` }))
      : [el("li", { text: "Nothing recorded yet." })];
    return el("section", { className: `aisq-plan-summary ${className}`.trim(), attrs: { "aria-label": title } }, [
      el("strong", { text: title }),
      el("ul", {}, rows)
    ]);
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
    const proposedEntries = [...proposedDecisions, ...computedProposals].slice(0, 12);
    const stages = (resolved.stageSelection || []).map((stage) => el("li", { text: stage.title || stage.id || "Generated stage" }));
    const activeQuestion = resolved.questions.find((question) => question.id === resolved.activeQuestionId) || resolved.questions[0];
    if (activeQuestion) {
      const lastShown = [...(ctx.state.eventLog || [])].reverse().find((entry) => entry.event === Core.EVENTS.PLAN_QUESTION_SHOWN);
      if (lastShown?.payload?.questionId !== activeQuestion.id) {
        Core.commitTransition(ctx.state, Core.EVENTS.PLAN_QUESTION_SHOWN, { questionId: activeQuestion.id });
        ctx.scheduleSave?.();
      }
    }
    const needed = activeQuestion
      ? [el("small", { className: "aisq-plan-question-count", text: `Clarification ${resolved.questions.indexOf(activeQuestion) + 1} of ${resolved.questions.length}` }), questionControl(activeQuestion, resolved, resolved.questions)]
      : [el("div", { className: "aisq-plan-empty", text: "No clarification is required before review." })];
    const proposalReview = Object.entries(resolved.draft.decisions || {})
      .filter(([, decision]) => decision?.status === "proposed")
      .map(([key, decision]) => {
        const question = plan.QUESTIONS.find((item) => item.answerKey === key);
        const affected = (resolved.dependencies[key] || []).join(", ") || "generated output";
        return el("li", { text: `${key}: ${displayValue(decision.value)} · affects ${affected}${question ? ` · ${question.reason}` : ""}` });
      });
    const review = [...proposalReview, ...resolved.needsReview.map((item) => el("li", { text: `${item.key}: ${item.reason}` }))];
    if (!review.length) review.push(el("li", { text: "No upstream changes need review." }));
    let busy = false;

    const approve = (run) => {
      if (busy) return;
      const latest = plan.resolveDraft(ctx.state.ui.planDraft, { specApi });
      if (latest.requiredQuestionIds.length) {
        ctx.toast("Answer or dismiss the highlighted consequential questions before approval.", "error");
        return;
      }
      busy = true;
      const approvedDraft = plan.approveProposals(ctx.state.ui.planDraft);
      const approved = plan.resolveDraft(approvedDraft, { specApi });
      const result = specApi.assembleSpec(approved.generatedAnswers, approved.generatedAnswers.stageOverrides || {});
      const parsed = Core.parsePromptPack(result.raw, result.strategy);
      const chain = Core.makeChain(approved.generatedAnswers.name || "Generated App", parsed.prompts, result.raw, {
        splitStrategy: parsed.strategy,
        preface: result.preface
      });
      const imported = ctx.command("APPROVE_PLAN_IMPORT", {
        chain,
        commitId: Core.uid("plan-commit"),
        run,
        placement: ctx.state.settings.pastePlacement === "end" ? "bottom" : "after",
        afterChainId: ctx.state.settings.pastePlacement === "end" ? null : ctx.state.selectedChainId
      }, { history: { kind: "plan_approved", message: "Approved Draft Plan and added one chain" } });
      if (imported.ok) {
        ctx.requestRender(true);
      } else {
        busy = false;
      }
    };

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
        el("span", { className: "aisq-plan-confidence", text: `${Math.round(resolved.confidence * 100)}% confidence` })
      ]),
      el("div", { className: "aisq-plan-hero" }, [
        el("strong", { text: resolved.answers.name || "Untitled app" }),
        el("p", { text: resolved.answers.description || "Describe the outcome this app should deliver." }),
        el("small", { text: `${resolved.stageSelection.length || "Auto"} stage plan · ${resolved.questions.length} clarification${resolved.questions.length === 1 ? "" : "s"}` })
      ]),
      summaryList("You chose", explicitEntries),
      summaryList("Suggested", proposedEntries, "aisq-plan-suggested"),
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
        button("Approve assumptions & Add to Queue", () => approve(false), "ghost"),
        button("Approve assumptions & Run (Generate & Run ▶)", () => approve(true), "primary")
      ])
    ]);
  }

  Object.assign(ctx, { renderDraftPlanDetails });
})(typeof globalThis !== "undefined" ? globalThis : this);
