"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Plan = require("../src/plan-engine.js");
const AISQSpec = require("../src/spec-engine.js");

const specApi = {
  inferDefaults(answers) {
    return {
      ...answers,
      archetype: answers.archetype || "web-app",
      scale: answers.scale || "hobby",
      frontend: answers.frontend || "Vanilla JS",
      backend: answers.backend || "None",
      database: answers.database || "None",
      hosting: answers.hosting || "GitHub Pages",
      genre: answers.genre || "minimal",
      authType: answers.authType || "None",
      screens: answers.screens || ["Home", "Dashboard", "Settings"]
    };
  },
  resolveStages(answers) {
    return [{ id: "foundation", enabled: true, answers }];
  }
};

test("createDraft keeps user intent confirmed and caps deterministic questions at three", () => {
  const draft = Plan.createDraft("user", { rawDescription: "Build a reading tracker for students", description: "Build a reading tracker for students" });
  const resolved = Plan.resolveDraft(draft, { specApi });
  assert.equal(draft.decisions.description.status, "confirmed");
  assert.deepEqual(resolved.questions.map((question) => question.id), ["archetype", "scale", "features"]);
  assert.ok(resolved.questions.length <= 3);
  assert.equal(resolved.activeQuestionId, "archetype");
  assert.equal(resolved.stageSelection[0].id, "foundation");
});

test("template and extractor values remain proposed until approval", () => {
  const draft = Plan.createDraft("template", { name: "Starter", description: "A focused app", archetype: "saas", scale: "startup" });
  assert.equal(draft.decisions.name.status, "proposed");
  assert.equal(draft.decisions.archetype.source, "template");
  const approved = Plan.approveProposals(draft);
  assert.equal(approved.decisions.name.status, "confirmed");
  assert.ok(approved.decisions.name.confirmedAgainst);
  assert.deepEqual(Plan.resolveDraft(approved, { specApi }).requiredQuestionIds, ["industry"]);
});

test("legacy spec answers migrate into confirmed decisions without storing computed defaults", () => {
  const draft = Plan.migrateDraft(null, { description: "Legacy app", archetype: "dashboard", scale: "mvp" });
  assert.equal(draft.intent.source, "legacy");
  assert.equal(draft.decisions.description.status, "confirmed");
  const resolved = Plan.resolveDraft(draft, { specApi });
  assert.equal(resolved.defaults.frontend, "Vanilla JS");
  assert.equal(draft.decisions.frontend, undefined);
});

test("confirmed downstream decisions become reviewable when an upstream dependency changes", () => {
  let draft = Plan.createDraft("user", { description: "Build a SaaS dashboard", archetype: "saas", scale: "startup", frontend: "React" });
  draft = Plan.setDecision(draft, "scale", "enterprise");
  const resolved = Plan.resolveDraft(draft, { specApi });
  assert.ok(resolved.needsReview.some((item) => item.key === "frontend"));
});

test("dismissal is stable until dependencies change, then becomes eligible again", () => {
  let draft = Plan.createDraft("user", { description: "Build a small app" });
  draft = Plan.dismissQuestion(draft, "archetype");
  let resolved = Plan.resolveDraft(draft, { specApi });
  assert.equal(resolved.questions.some((question) => question.id === "archetype"), false);
  draft = Plan.setDecision(draft, "description", "Build an enterprise payments platform with audited workflows");
  resolved = Plan.resolveDraft(draft, { specApi });
  assert.equal(resolved.questions.some((question) => question.id === "archetype"), true);
});

test("setDecision is pure and records direct edits as confirmed user decisions", () => {
  const original = Plan.createDraft("user", { description: "Build a small app" });
  const next = Plan.setDecision(original, "audience", "Independent shop owners");
  assert.equal(original.decisions.audience, undefined);
  assert.equal(next.decisions.audience.status, "confirmed");
  assert.equal(next.decisions.audience.source, "user");
});

test("production drafts block only on consequential trust decisions without a safe value", () => {
  const draft = Plan.createDraft("user", { description: "Build an audited production payments platform", archetype: "saas", scale: "production" });
  const resolved = Plan.resolveDraft(draft, { specApi });
  assert.deepEqual(resolved.requiredQuestionIds, ["industry", "security"]);
  assert.ok(resolved.questions.some((question) => question.id === "industry"));
});

test("every registered question changes a generated answer or eligibility", () => {
  const base = { description: "Build a focused application for a small team.", archetype: "web-app", scale: "startup", features: "Core workflow" };
  for (const question of Plan.QUESTIONS) {
    const before = Plan.resolveDraft(Plan.createDraft("user", base), { specApi });
    const value = question.inputType === "boolean" ? true
      : question.inputType === "stageOverrides" ? { testing: false }
      : question.options?.find((option) => JSON.stringify(option) !== JSON.stringify(base[question.answerKey])) || `Answer for ${question.id}`;
    const afterDraft = Plan.setDecision(Plan.createDraft("user", base), question.answerKey, value);
    const after = Plan.resolveDraft(afterDraft, { specApi });
    const changed = JSON.stringify(before.generatedAnswers[question.answerKey]) !== JSON.stringify(after.generatedAnswers[question.answerKey]) ||
      JSON.stringify(before.stageSelection) !== JSON.stringify(after.stageSelection) ||
      JSON.stringify(before.requiredQuestionIds) !== JSON.stringify(after.requiredQuestionIds) ||
      JSON.stringify(before.needsReview) !== JSON.stringify(after.needsReview);
    assert.equal(changed, true, `${question.id} must affect output or eligibility`);
  }
});

test("description signals become visible planner proposals instead of silently suppressing questions", () => {
  const draft = Plan.createDraft("user", { description: "Build an enterprise SaaS dashboard for finance teams" });
  assert.equal(draft.decisions.description.status, "confirmed");
  assert.equal(draft.decisions.archetype.value, "saas");
  assert.equal(draft.decisions.archetype.status, "proposed");
  assert.equal(draft.decisions.archetype.source, "planner");
  assert.equal(draft.decisions.scale.value, "enterprise");
  const resolved = Plan.resolveDraft(draft, { specApi: AISQSpec });
  assert.equal(resolved.questions.some((question) => question.id === "archetype"), false);
  assert.equal(resolved.graph.nodes.find((node) => node.id === "archetype").state, "proposed");
});

test("automatic clarification budget is capped across the lifetime of a draft", () => {
  let draft = Plan.createDraft("user", { description: "Build app." });
  for (let index = 0; index < 5; index += 1) {
    const resolved = Plan.resolveDraft(draft, { specApi });
    const active = resolved.questions[0];
    if (!active) break;
    draft = Plan.markQuestionShown(draft, active.id);
    const answer = active.inputType === "boolean" ? true : active.options?.[0] || `Answer ${index}`;
    draft = Plan.setDecision(draft, active.answerKey, answer);
  }
  const final = Plan.resolveDraft(draft, { specApi });
  assert.equal(draft.shownQuestionIds.length, 3);
  assert.equal(final.questions.length, 0);
});

test("custom category and size preserve raw intent, canonical profiles, and bounded tailored branches", () => {
  let draft = Plan.createDraft("user", { description: "Build a workspace." });
  draft = Plan.setCustomChoice(draft, "archetype", "Real-time medical triage workspace", "saas");
  draft = Plan.setCustomChoice(draft, "scale", "Regional hospital pilot", "production");
  const resolved = Plan.resolveDraft(draft, { specApi: AISQSpec });
  assert.equal(resolved.explicit.archetype, "saas");
  assert.equal(resolved.explicit.archetypeDetail, "Real-time medical triage workspace");
  assert.equal(resolved.explicit.scale, "production");
  assert.equal(resolved.explicit.scaleDetail, "Regional hospital pilot");
  assert.ok(resolved.customQuestions.length > 0);
  assert.ok(resolved.customQuestions.length <= Plan.CUSTOM_BRANCH_LIMIT);
  assert.equal(new Set(resolved.graph.nodes.map((node) => node.id)).size, resolved.graph.nodes.length);
  assert.ok(resolved.graph.nodes.some((node) => node.branchId === "regulated-domain"));
  assert.ok(resolved.graph.nodes.some((node) => node.branchId === "realtime-collaboration"));
  assert.equal(resolved.graph.supportsCustomChoices, true);
  assert.equal(resolved.generatedAnswers.archetype, "saas");
  assert.equal(resolved.generatedAnswers.archetypeDetail, "Real-time medical triage workspace");
  assert.ok(resolved.generatedAnswers.customContext.some((item) => /sensitive or regulated data/i.test(item.label)));
  const spec = AISQSpec.assembleSpec(resolved.generatedAnswers);
  assert.match(spec.preface, /Custom Product Category: Real-time medical triage workspace/);
  assert.match(spec.preface, /Tailored Context:/);
});

test("legacy unknown custom size migrates to a reviewable conservative profile, never hobby", () => {
  const draft = Plan.migrateDraft(null, { description: "Legacy project", scale: "regional clinical pilot" });
  assert.equal(draft.decisions.scale.value, "production");
  assert.equal(draft.decisions.scale.status, "proposed");
  assert.equal(draft.decisions.scaleDetail.value, "regional clinical pilot");
  const resolved = Plan.resolveDraft(draft, { specApi: AISQSpec });
  assert.equal(resolved.generatedAnswers.scale, "production");
  assert.ok(draft.unresolvedProfileKeys.includes("scale"));
  assert.ok(resolved.requiredQuestionIds.includes("scale"), "a conservative fallback is not an approved delivery mapping");
  assert.equal(resolved.graph.readiness.queueEligible, false);
  const superficiallyApproved = Plan.resolveDraft(Plan.approveProposals(draft), { specApi: AISQSpec });
  assert.ok(superficiallyApproved.requiredQuestionIds.includes("scale"), "bulk proposal approval cannot bypass explicit profile mapping");
  const stages = resolved.stageSelection.map((stage) => stage.id);
  assert.ok(stages.includes("security"));
  assert.ok(stages.includes("testing"));
  assert.ok(stages.includes("deployment"));
});

test("Draft v1 migrates to v2 without persisting computed graph state", () => {
  const raw = {
    version: 1,
    intent: { rawDescription: "Build a regional tool", source: "legacy" },
    decisions: {
      description: { value: "Build a regional tool", status: "confirmed", source: "legacy" },
      scale: { value: "regional rollout", status: "confirmed", source: "legacy" }
    },
    activeQuestionId: "archetype",
    requiredQuestionIds: ["security"],
    dismissedQuestions: {}
  };
  const migrated = Plan.migrateDraft(raw);
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.shownQuestionIds, ["archetype"]);
  assert.equal(migrated.decisions.scale.value, "production");
  assert.equal(migrated.decisions.scale.status, "proposed");
  assert.equal(migrated.decisions.scaleDetail.value, "regional rollout");
  assert.deepEqual(migrated.unresolvedProfileKeys, ["scale"]);
  assert.equal(migrated.graph, undefined);
});

test("unknown imported categories require an explicit compatible profile on every entry source", () => {
  for (const source of ["user", "template", "extractor", "legacy"]) {
    const draft = source === "legacy"
      ? Plan.migrateDraft(null, { description: "Build a novel workspace", archetype: "ritual-based community workspace" })
      : Plan.createDraft(source, { description: "Build a novel workspace", archetype: "ritual-based community workspace" });
    const unresolved = Plan.resolveDraft(draft, { specApi: AISQSpec });
    assert.ok(unresolved.requiredQuestionIds.includes("archetype"), `${source} must require category mapping`);
    assert.equal(unresolved.graph.nodes.find((node) => node.id === "archetype").state, "required");
    assert.equal(unresolved.graph.readiness.queueEligible, false);

    const mapped = Plan.setCustomChoice(draft, "archetype", "ritual-based community workspace", "web-app");
    const resolved = Plan.resolveDraft(mapped, { specApi: AISQSpec });
    assert.equal(resolved.requiredQuestionIds.includes("archetype"), false);
    assert.equal(resolved.explicit.archetypeDetail, "ritual-based community workspace");
    assert.ok(resolved.customQuestions.some((question) => question.branchId === "generic-custom-intent"), "every custom choice gets a tailored path");
    assert.ok(resolved.generatedAnswers.customContext.some((item) => /closest build profile/i.test(item.label)));
  }
});

test("multi-match custom paths prioritize safety and disclose every capped branch", () => {
  let draft = Plan.createDraft("user", { description: "Build a specialized control workspace." });
  draft = Plan.setCustomChoice(draft, "archetype", "Autonomous real-time medical drone system", "agent-swarm");
  const resolved = Plan.resolveDraft(draft, { specApi: AISQSpec });
  assert.deepEqual(resolved.customQuestions.map((question) => question.branchId), [
    "physical-systems",
    "agentic-system",
    "regulated-domain"
  ]);
  assert.ok(resolved.omittedCustomQuestions.some((question) => question.branchId === "realtime-collaboration"));
  assert.ok(resolved.omittedCustomQuestions.some((question) => question.branchId === "generic-custom-intent"));
  assert.equal(resolved.graph.progress.customOmitted, resolved.omittedCustomQuestions.length);
  assert.equal(resolved.graph.omittedCustomBranches.length, resolved.omittedCustomQuestions.length);
  assert.ok(resolved.graph.nodes.filter((node) => node.omitted).every((node) => node.locked && node.state === "locked"));
  assert.ok(resolved.generatedAnswers.customContext.some((item) => /simultaneous edits/i.test(item.label)), "omitted safe context still reaches generation");
  assert.ok(resolved.generatedAnswers.customContext.some((item) => /closest build profile/i.test(item.label)), "generic capped context is not silently dropped");
});

test("graph exposes honest progress, literal effects, and stable acyclic tree edges", () => {
  const draft = Plan.createDraft("user", { description: "Build a reading tracker for students", archetype: "web-app", scale: "mvp" });
  const first = Plan.resolveDraft(draft, { specApi: AISQSpec });
  const second = Plan.resolveDraft(draft, { specApi: AISQSpec });
  assert.deepEqual(first.graph, second.graph);
  assert.ok(first.graph.progress.completed < first.graph.progress.total);
  assert.ok(first.graph.progress.assumptions > 0);
  assert.deepEqual(first.effects.scale, ["stages", "architecture", "risk"]);
  const parents = new Map(first.graph.treeEdges.map((edge) => [edge.to, edge.from]));
  for (const node of first.graph.nodes) {
    const seen = new Set([node.id]);
    let parent = parents.get(node.id);
    while (parent) {
      assert.equal(seen.has(parent), false, `cycle at ${node.id}`);
      seen.add(parent);
      parent = parents.get(parent);
    }
  }
});

test("custom branch dismissals survive reload and reopen when their parent intent changes", () => {
  let draft = Plan.createDraft("user", { description: "Build a workspace." });
  draft = Plan.setCustomChoice(draft, "archetype", "Medical triage workspace", "saas");
  let resolved = Plan.resolveDraft(draft, { specApi: AISQSpec });
  const custom = resolved.customQuestions[0];
  draft = Plan.dismissQuestion(draft, custom.id);
  const reloaded = Plan.migrateDraft(JSON.parse(JSON.stringify(draft)));
  resolved = Plan.resolveDraft(reloaded, { specApi: AISQSpec });
  assert.equal(resolved.questions.some((question) => question.id === custom.id), false);
  draft = Plan.setDecision(reloaded, "archetypeDetail", "Real-time medical payments workspace");
  resolved = Plan.resolveDraft(draft, { specApi: AISQSpec });
  assert.equal(resolved.questions.some((question) => question.id === custom.id), true);
});

test("future branch providers are schema-bounded and proposal-only", () => {
  const accepted = Plan.validateBranchProposal({
    id: "medical-tailoring",
    label: "Medical tailoring",
    stageOverrides: { security: false },
    questions: [{
      id: "approval",
      label: "Who approves a consequential recommendation?",
      inputType: "select",
      options: ["Clinician", "Supervisor"],
      reason: "Approval authority changes workflow and audit requirements.",
      affects: ["workflow", "audit"],
      safeDefault: "Clinician"
    }]
  }, "archetypeDetail");
  assert.equal(accepted.ok, true);
  assert.equal(accepted.value.authority, "proposal-only");
  assert.equal(accepted.value.questions[0].answerKey, "provider.medical-tailoring.approval");
  assert.equal(accepted.value.questions[0].stageOverrides, undefined);
  assert.deepEqual(Plan.BRANCH_PROVIDER_CONTRACT.allowedInputTypes, ["text", "textarea", "select", "boolean"]);
  assert.equal(Plan.BRANCH_PROVIDER_CONTRACT.remoteEnabled, false);

  const oversized = Plan.validateBranchProposal({
    id: "too-many",
    questions: Array.from({ length: 5 }, (_, index) => ({ id: `q${index}`, label: "Question", reason: "Reason", inputType: "text", affects: ["preface"] }))
  }, "archetypeDetail");
  assert.equal(oversized.ok, false);
  assert.equal(Plan.validateBranchProposal({ id: "<script>", questions: [] }, "archetypeDetail").ok, false);
});
