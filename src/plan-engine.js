(function initAISQPlan(global) {
  "use strict";

  const catalog = global.AISQPlanQuestions || (typeof require !== "undefined" ? require("./plan-questions.js") : { QUESTIONS: [], byId: {} });
  const QUESTIONS = catalog.QUESTIONS || [];
  const byId = catalog.byId || {};
  const DRAFT_VERSION = 1;
  const SOURCES = new Set(["user", "template", "extractor", "legacy"]);
  const STATUSES = new Set(["confirmed", "proposed"]);
  const DEPENDENCIES = Object.freeze({
    name: ["description"],
    description: [],
    archetype: ["description"],
    scale: ["description", "archetype"],
    features: ["description", "archetype", "scale"],
    screens: ["description", "archetype", "scale", "features"],
    audience: ["description", "archetype"],
    genre: ["archetype", "scale"],
    mobileFirst: ["archetype", "scale"],
    darkMode: ["archetype", "scale"],
    productionQuality: ["scale"],
    frontend: ["archetype", "scale"],
    backend: ["archetype", "scale"],
    database: ["archetype", "scale", "backend"],
    hosting: ["scale", "backend"],
    industry: ["scale", "archetype"],
    authType: ["scale", "archetype"],
    security: ["scale", "industry", "authType"],
    stageOverrides: ["archetype", "scale", "productionQuality"]
  });
  const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const text = (value) => String(value ?? "").trim();
  const hasValue = (value) => value !== undefined && value !== null && (typeof value === "boolean" || text(value) !== "");

  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }

  function fingerprint(value) {
    const input = stable(value);
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fp:${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function normalizeSource(source) {
    const value = String(source || "user").toLowerCase();
    return SOURCES.has(value) ? value : "user";
  }

  function dependencyValues(key, answers) {
    const question = byId[key];
    const dependencies = DEPENDENCIES[key] || [];
    return { key, dependencies, values: dependencies.reduce((result, dependency) => {
      result[dependency] = answers?.[dependency];
      return result;
    }, {}) };
  }

  function makeDecision(key, value, status, source, answers) {
    const decision = {
      value: clone(value),
      status: STATUSES.has(status) ? status : "proposed",
      source: normalizeSource(source)
    };
    if (decision.status === "confirmed") decision.confirmedAgainst = fingerprint(dependencyValues(key, answers || {}));
    return decision;
  }

  function normalizedDecision(key, raw, answers) {
    if (!raw || !hasValue(raw.value)) return null;
    const status = STATUSES.has(raw.status) ? raw.status : "proposed";
    const source = normalizeSource(raw.source);
    const decision = { value: clone(raw.value), status, source };
    if (status === "confirmed") {
      decision.confirmedAgainst = String(raw.confirmedAgainst || fingerprint(dependencyValues(key, answers)));
    }
    return decision;
  }

  function createDraft(source = "user", payload = {}) {
    const origin = normalizeSource(source);
    const input = payload && typeof payload === "object" ? payload : {};
    const decisions = {};
    const initialAnswers = {};
    for (const question of QUESTIONS) {
      if (!hasValue(input[question.answerKey])) continue;
      initialAnswers[question.answerKey] = clone(input[question.answerKey]);
    }
    for (const question of QUESTIONS) {
      const value = input[question.answerKey];
      if (!hasValue(value)) continue;
      const status = origin === "user" || origin === "legacy" ? "confirmed" : "proposed";
      decisions[question.answerKey] = makeDecision(question.answerKey, value, status, origin, initialAnswers);
    }
    const rawDescription = text(input.rawDescription || input.description);
    return {
      version: DRAFT_VERSION,
      intent: { rawDescription, source: origin },
      decisions,
      activeQuestionId: null,
      requiredQuestionIds: [],
      dismissedQuestions: {}
    };
  }

  function migrateDraft(rawDraft, legacyAnswers = {}) {
    if (!rawDraft || typeof rawDraft !== "object") {
      const legacy = legacyAnswers && typeof legacyAnswers === "object" ? legacyAnswers : {};
      return Object.keys(legacy).length ? createDraft("legacy", legacy) : null;
    }
    const source = normalizeSource(rawDraft.intent?.source || "legacy");
    const rawDecisions = rawDraft.decisions && typeof rawDraft.decisions === "object" ? rawDraft.decisions : {};
    const answers = Object.fromEntries(Object.entries(rawDecisions).map(([key, value]) => [key, value?.value]).filter(([, value]) => hasValue(value)));
    const decisions = {};
    for (const question of QUESTIONS) {
      const decision = normalizedDecision(question.answerKey, rawDecisions[question.answerKey], answers);
      if (decision) decisions[question.answerKey] = decision;
    }
    if (!Object.keys(decisions).length && source === "legacy" && legacyAnswers && typeof legacyAnswers === "object") {
      return createDraft("legacy", legacyAnswers);
    }
    const dismissedQuestions = {};
    for (const [questionId, raw] of Object.entries(rawDraft.dismissedQuestions || {})) {
      if (byId[questionId] && raw && typeof raw === "object") {
        dismissedQuestions[questionId] = {
          ruleVersion: String(raw.ruleVersion || "1"),
          dependencyFingerprint: String(raw.dependencyFingerprint || "")
        };
      }
    }
    return {
      version: DRAFT_VERSION,
      intent: {
        rawDescription: text(rawDraft.intent?.rawDescription || legacyAnswers?.description),
        source
      },
      decisions,
      activeQuestionId: byId[rawDraft.activeQuestionId] ? rawDraft.activeQuestionId : null,
      requiredQuestionIds: Array.isArray(rawDraft.requiredQuestionIds) ? rawDraft.requiredQuestionIds.filter((id) => byId[id]) : [],
      dismissedQuestions
    };
  }

  function answerMap(draft) {
    return Object.fromEntries(Object.entries(draft?.decisions || {}).filter(([, decision]) => decision && hasValue(decision.value)).map(([key, decision]) => [key, clone(decision.value)]));
  }

  function defaultAnswers(answers, specApi) {
    const inferred = specApi?.inferDefaults ? specApi.inferDefaults(answers) : {
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
    return {
      ...inferred,
      name: inferred.name || "Untitled App",
      description: inferred.description || "A focused application.",
      features: inferred.features || "Core application functionality.",
      audience: inferred.audience || "General users"
    };
  }

  function explicitAnswers(draft) {
    return answerMap(draft);
  }

  function isUncertain(question, answers, draft, explicit) {
    const key = question.answerKey;
    if (hasValue(explicit[key])) return false;
    const description = text(answers.description || draft?.intent?.rawDescription);
    if (key === "description") return description.length < 16;
    if (key === "name") return !description || description.length < 36;
    if (key === "features") return !hasValue(explicit.features) && description.length < 90;
    if (key === "archetype") return !hasValue(explicit.archetype) && !/(dashboard|saas|shop|commerce|portfolio|mobile|game|api|agent|ai|machine learning)/i.test(description);
    if (key === "scale") return !hasValue(explicit.scale) && !/(enterprise|production|startup|mvp|prototype|hobby)/i.test(description);
    if (key === "audience") return !hasValue(explicit.audience) && description.length < 60;
    if (key === "industry") return !hasValue(explicit.industry) && /^(startup|production|enterprise)$/.test(String(answers.scale || ""));
    if (key === "security") return !hasValue(explicit.security) && /^(production|enterprise)$/.test(String(answers.scale || ""));
    return false;
  }

  function isDismissed(draft, questionId, answers) {
    const dismissed = draft?.dismissedQuestions?.[questionId];
    if (!dismissed) return false;
    const current = fingerprint(dependencyValues(questionId, answers));
    return dismissed.ruleVersion === "1" && dismissed.dependencyFingerprint === current;
  }

  function resolveDraft(rawDraft, options = {}) {
    const draft = migrateDraft(rawDraft) || createDraft("user", {});
    const explicit = explicitAnswers(draft);
    const answers = defaultAnswers(explicit, options.specApi || global.AISQSpec);
    const defaults = {};
    for (const [key, value] of Object.entries(answers)) if (!hasValue(explicit[key])) defaults[key] = clone(value);

    const needsReview = [];
    for (const [key, decision] of Object.entries(draft.decisions || {})) {
      if (decision.status !== "confirmed") continue;
      const current = fingerprint(dependencyValues(key, answers));
      if (decision.confirmedAgainst && decision.confirmedAgainst !== current) needsReview.push({ key, reason: "An upstream decision changed." });
    }

    const questions = QUESTIONS.filter((question) => question.visibleWhen(answers) && isUncertain(question, answers, draft, explicit) && !isDismissed(draft, question.id, answers))
      .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
      .slice(0, 3);
    // Questions may still be useful for review even when a deterministic,
    // visible fallback exists.  Only a question with no safe generated value
    // blocks approval.
    const requiredQuestionIds = questions.filter((question) => !hasValue(answers[question.answerKey])).map((question) => question.id);
    const stageSelection = options.specApi?.resolveStages ? options.specApi.resolveStages(answers) : [];
    const scores = Object.entries(answers).map(([key]) => {
      const decision = draft.decisions?.[key];
      return decision ? (decision.status === "confirmed" ? 1 : 0.65) : 0.5;
    });
    const confidence = scores.length ? Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 100) / 100 : 0.5;
    const rationales = {};
    for (const question of QUESTIONS) rationales[question.answerKey] = question.reason;
    return {
      draft,
      answers,
      explicit,
      defaults,
      openDecisions: questions.map((question) => question.answerKey),
      questions,
      requiredQuestionIds,
      activeQuestionId: draft.activeQuestionId && questions.some((question) => question.id === draft.activeQuestionId) ? draft.activeQuestionId : (questions[0]?.id || null),
      needsReview,
      rationales,
      confidence,
      dependencies: Object.fromEntries(QUESTIONS.map((question) => [question.answerKey, DEPENDENCIES[question.answerKey] || []])),
      stageSelection,
      generatedAnswers: clone(answers),
      needsReviewFlag: needsReview.length > 0
    };
  }

  function setDecision(rawDraft, key, value, options = {}) {
    if (!byId[key]) throw new Error(`Unknown plan decision: ${key}`);
    const draft = migrateDraft(rawDraft) || createDraft("user", {});
    const next = clone(draft);
    if (!hasValue(value)) delete next.decisions[key];
    else {
      const answers = answerMap(next);
      answers[key] = clone(value);
      next.decisions[key] = makeDecision(key, value, options.status || "confirmed", options.source || "user", answers);
    }
    next.activeQuestionId = null;
    return next;
  }

  function approveProposals(rawDraft) {
    const draft = migrateDraft(rawDraft) || createDraft("user", {});
    const next = clone(draft);
    const answers = answerMap(next);
    for (const [key, decision] of Object.entries(next.decisions)) {
      if (decision.status === "proposed") {
        decision.status = "confirmed";
        decision.source = decision.source || "template";
        decision.confirmedAgainst = fingerprint(dependencyValues(key, answers));
      }
    }
    next.requiredQuestionIds = [];
    next.activeQuestionId = null;
    return next;
  }

  function dismissQuestion(rawDraft, questionId) {
    if (!byId[questionId]) throw new Error(`Unknown plan question: ${questionId}`);
    const draft = migrateDraft(rawDraft) || createDraft("user", {});
    const next = clone(draft);
    const answers = answerMap(next);
    next.dismissedQuestions[questionId] = {
      ruleVersion: "1",
      dependencyFingerprint: fingerprint(dependencyValues(questionId, answers))
    };
    if (next.activeQuestionId === questionId) next.activeQuestionId = null;
    return next;
  }

  function planToSpecAnswers(rawDraft, options = {}) {
    return resolveDraft(rawDraft, options).generatedAnswers;
  }

  const api = {
    DRAFT_VERSION,
    QUESTIONS,
    fingerprint,
    createDraft,
    migrateDraft,
    setDecision,
    resolveDraft,
    approveProposals,
    dismissQuestion,
    planToSpecAnswers
  };
  global.AISQPlan = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
