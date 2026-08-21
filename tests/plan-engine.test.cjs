"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Plan = require("../src/plan-engine.js");

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
