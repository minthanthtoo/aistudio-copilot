(function initAISQPlan(global) {
  "use strict";

  const catalog = global.AISQPlanQuestions || (typeof require !== "undefined" ? require("./plan-questions.js") : {});
  const QUESTIONS = catalog.QUESTIONS || [];
  const CUSTOM_BRANCH_RULES = catalog.CUSTOM_BRANCH_RULES || [];
  const CUSTOM_QUESTIONS = catalog.CUSTOM_QUESTIONS || [];
  const ALL_QUESTIONS = catalog.ALL_QUESTIONS || QUESTIONS;
  const byId = catalog.byId || Object.fromEntries(ALL_QUESTIONS.map((question) => [question.id, question]));
  const byAnswerKey = catalog.byAnswerKey || Object.fromEntries(ALL_QUESTIONS.map((question) => [question.answerKey, question]));
  const DRAFT_VERSION = 2;
  const QUESTION_LIMIT = 3;
  const CUSTOM_BRANCH_LIMIT = 3;
  const GENERATED_BRANCH_LIMIT = 4;
  const BRANCH_PROVIDER_CONTRACT = Object.freeze({
    version: 1,
    maxQuestions: GENERATED_BRANCH_LIMIT,
    remoteEnabled: false,
    allowedInputTypes: Object.freeze(["text", "textarea", "select", "boolean"]),
    authority: "proposal-only"
  });
  const SOURCES = new Set(["user", "template", "extractor", "legacy", "planner"]);
  const STATUSES = new Set(["confirmed", "proposed"]);
  const DEPENDENCIES = Object.freeze({
    name: ["description"],
    description: [],
    archetype: ["description"],
    archetypeDetail: ["description", "archetype"],
    scale: ["description", "archetype"],
    scaleDetail: ["description", "archetype", "scale"],
    features: ["description", "archetype", "scale"],
    featureChips: ["features", "archetype"],
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
    stageOverrides: ["archetype", "scale", "productionQuality"],
    flowDescription: ["archetype", "screens"]
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

  function dependenciesFor(key) {
    return byAnswerKey[key]?.dependsOn || DEPENDENCIES[key] || [];
  }

  function dependencyValues(key, answers) {
    const dependencies = dependenciesFor(key);
    return {
      key,
      dependencies,
      values: dependencies.reduce((result, dependency) => {
        result[dependency] = answers?.[dependency];
        return result;
      }, {})
    };
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
    if (status === "confirmed") decision.confirmedAgainst = String(raw.confirmedAgainst || fingerprint(dependencyValues(key, answers)));
    return decision;
  }

  function recognizedOption(key, value) {
    const options = byAnswerKey[key]?.options || [];
    return options.includes(value);
  }

  function customValueParts(value) {
    if (!value || typeof value !== "object" || value.kind !== "custom") return null;
    return {
      raw: text(value.raw || value.label),
      canonical: text(value.canonical || value.resolvedAs)
    };
  }

  function normalizeInput(payload = {}) {
    const values = clone(payload && typeof payload === "object" ? payload : {}) || {};
    const proposedKeys = new Set();
    const unresolvedProfileKeys = new Set();
    const derivedFrom = {};
    const normalizeCustom = (key, detailKey, fallback, profileKey) => {
      const structured = customValueParts(values[key]);
      const supplied = structured?.raw || text(values[key]);
      const sentinel = supplied === "custom" || supplied === "__custom__" || supplied === "__aisq_custom__";
      const known = recognizedOption(key, supplied);
      const detail = text(values[detailKey] || structured?.raw || (!known && !sentinel ? supplied : ""));
      const requestedProfile = text(structured?.canonical || values[profileKey]);
      if (detail) values[detailKey] = detail;
      if (structured || sentinel || (!known && supplied)) {
        const hasExplicitProfile = recognizedOption(key, requestedProfile);
        values[key] = hasExplicitProfile ? requestedProfile : fallback;
        derivedFrom[detailKey] = key;
        if (!hasExplicitProfile) {
          proposedKeys.add(key);
          unresolvedProfileKeys.add(key);
        }
      }
    };
    normalizeCustom("archetype", "archetypeDetail", "web-app", "archetypeProfile");
    normalizeCustom("scale", "scaleDetail", "production", "deliveryProfile");
    return { values, proposedKeys, unresolvedProfileKeys, derivedFrom };
  }

  function inferDescriptionDecisions(description) {
    const value = text(description);
    const inferred = {};
    if (/\b(saas|subscription|multi-tenant|multitenant)\b/i.test(value)) inferred.archetype = "saas";
    else if (/\b(dashboard|analytics console|admin console)\b/i.test(value)) inferred.archetype = "dashboard";
    else if (/\b(shop|storefront|e-?commerce|checkout|shopping cart)\b/i.test(value)) inferred.archetype = "e-commerce";
    else if (/\b(portfolio|personal site|showcase)\b/i.test(value)) inferred.archetype = "portfolio";
    else if (/\b(mobile app|ios app|android app|react native)\b/i.test(value)) inferred.archetype = "mobile-app";
    else if (/\b(game|gameplay|multiplayer game)\b/i.test(value)) inferred.archetype = "game";
    else if (/\b(api|webhook|developer service|service endpoint)\b/i.test(value)) inferred.archetype = "api-service";
    else if (/\b(agent swarm|multi-agent|autonomous agent|tool-using agent)\b/i.test(value)) inferred.archetype = "agent-swarm";
    else if (/\b(ai|ml|machine learning|llm|chatbot)\b/i.test(value)) inferred.archetype = "ai-ml-app";

    if (/\benterprise\b/i.test(value)) inferred.scale = "enterprise";
    else if (/\b(production|regulated|clinical|financial|public launch|business-critical)\b/i.test(value)) inferred.scale = "production";
    else if (/\bstartup\b/i.test(value)) inferred.scale = "startup";
    else if (/\b(mvp|pilot|beta)\b/i.test(value)) inferred.scale = "mvp";
    else if (/\b(hobby|prototype|personal experiment|proof of concept|poc)\b/i.test(value)) inferred.scale = "hobby";
    return inferred;
  }

  // Future local or consented remote planners must pass through this boundary.
  // The validator deliberately returns proposal-only question metadata: it
  // cannot emit stages, commands, HTML, or generator overrides.
  function validateBranchProposal(raw, parentQuestionId) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Branch proposal must be an object" };
    if (!byId[parentQuestionId]) return { ok: false, error: "Branch parent is not a registered decision" };
    const branchId = text(raw.id).toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(branchId)) return { ok: false, error: "Branch id is invalid" };
    if (!Array.isArray(raw.questions) || raw.questions.length === 0 || raw.questions.length > GENERATED_BRANCH_LIMIT) {
      return { ok: false, error: `Branch must contain 1-${GENERATED_BRANCH_LIMIT} questions` };
    }
    const allowedTypes = new Set(BRANCH_PROVIDER_CONTRACT.allowedInputTypes);
    const seen = new Set();
    const questions = [];
    for (let index = 0; index < raw.questions.length; index += 1) {
      const candidate = raw.questions[index];
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return { ok: false, error: `Question ${index + 1} is invalid` };
      const localId = text(candidate.id).toLowerCase();
      const label = text(candidate.label).slice(0, 180);
      const reason = text(candidate.reason).slice(0, 320);
      const inputType = text(candidate.inputType || "textarea");
      if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(localId) || seen.has(localId)) return { ok: false, error: `Question ${index + 1} has an invalid or duplicate id` };
      if (!label || !reason || !allowedTypes.has(inputType)) return { ok: false, error: `Question ${index + 1} is missing safe display metadata` };
      const options = inputType === "select"
        ? [...new Set((Array.isArray(candidate.options) ? candidate.options : []).map((value) => text(value).slice(0, 100)).filter(Boolean))].slice(0, 12)
        : [];
      if (inputType === "select" && options.length < 2) return { ok: false, error: `Question ${index + 1} needs at least two options` };
      const affects = [...new Set((Array.isArray(candidate.affects) ? candidate.affects : []).map((value) => text(value)).filter((value) => /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(value)))].slice(0, 8);
      if (!affects.length) return { ok: false, error: `Question ${index + 1} must declare affected outputs` };
      seen.add(localId);
      questions.push({
        id: `provider.${branchId}.${localId}`,
        section: "Custom path",
        answerKey: `provider.${branchId}.${localId}`,
        label,
        inputType,
        options,
        priority: 120 + index,
        parentId: index === 0 ? parentQuestionId : `provider.${branchId}.${questions[index - 1].id.split(".").at(-1)}`,
        dependsOn: [byId[parentQuestionId].answerKey],
        safeDefault: hasValue(candidate.safeDefault) ? clone(candidate.safeDefault) : undefined,
        reason,
        affects,
        branchId: `provider.${branchId}`,
        ruleVersion: text(raw.version || "1").slice(0, 32),
        source: "planner",
        authority: "proposal-only"
      });
    }
    return {
      ok: true,
      value: {
        id: `provider.${branchId}`,
        version: text(raw.version || "1").slice(0, 32),
        parentQuestionId,
        label: text(raw.label || branchId).slice(0, 120),
        source: "planner",
        authority: "proposal-only",
        questions
      }
    };
  }

  function addDescriptionProposals(decisions, answers, description) {
    const inferred = inferDescriptionDecisions(description);
    for (const [key, value] of Object.entries(inferred)) {
      if (decisions[key] || hasValue(answers[key])) continue;
      answers[key] = value;
      decisions[key] = makeDecision(key, value, "proposed", "planner", answers);
    }
  }

  function initialDraftShape(origin, rawDescription, decisions, unresolvedProfileKeys = []) {
    return {
      version: DRAFT_VERSION,
      intent: { rawDescription, source: origin },
      decisions,
      activeQuestionId: null,
      requiredQuestionIds: [],
      shownQuestionIds: [],
      dismissedQuestions: {},
      unresolvedProfileKeys: [...new Set(unresolvedProfileKeys)].filter((key) => key === "archetype" || key === "scale")
    };
  }

  function createDraft(source = "user", payload = {}) {
    const origin = normalizeSource(source);
    const input = payload && typeof payload === "object" ? payload : {};
    const normalized = normalizeInput(input);
    const initialAnswers = {};
    for (const question of ALL_QUESTIONS) {
      if (hasValue(normalized.values[question.answerKey])) initialAnswers[question.answerKey] = clone(normalized.values[question.answerKey]);
    }
    const decisions = {};
    for (const question of ALL_QUESTIONS) {
      const key = question.answerKey;
      const value = normalized.values[key];
      if (!hasValue(value)) continue;
      const status = normalized.proposedKeys.has(key)
        ? "proposed"
        : origin === "user" || origin === "legacy" ? "confirmed" : "proposed";
      const decisionSource = normalized.proposedKeys.has(key) ? "planner" : origin;
      decisions[key] = makeDecision(key, value, status, decisionSource, initialAnswers);
    }
    const rawDescription = text(input.rawDescription || normalized.values.description);
    addDescriptionProposals(decisions, initialAnswers, rawDescription);
    return initialDraftShape(origin, rawDescription, decisions, normalized.unresolvedProfileKeys);
  }

  function migrateDraft(rawDraft, legacyAnswers = {}) {
    if (!rawDraft || typeof rawDraft !== "object") {
      const legacy = legacyAnswers && typeof legacyAnswers === "object" ? legacyAnswers : {};
      return Object.keys(legacy).length ? createDraft("legacy", legacy) : null;
    }
    const source = normalizeSource(rawDraft.intent?.source || "legacy");
    const rawDecisions = rawDraft.decisions && typeof rawDraft.decisions === "object" ? rawDraft.decisions : {};
    const rawAnswers = Object.fromEntries(Object.entries(rawDecisions).map(([key, decision]) => [key, decision?.value]).filter(([, value]) => hasValue(value)));
    const normalized = normalizeInput({ ...(legacyAnswers || {}), ...rawAnswers });
    const decisions = {};
    const normalizedAnswers = Object.fromEntries(ALL_QUESTIONS.map((question) => [question.answerKey, normalized.values[question.answerKey]]).filter(([, value]) => hasValue(value)));
    for (const question of ALL_QUESTIONS) {
      const key = question.answerKey;
      const value = normalized.values[key];
      if (!hasValue(value)) continue;
      let raw = rawDecisions[key];
      if (!raw && normalized.derivedFrom[key]) raw = rawDecisions[normalized.derivedFrom[key]];
      if (normalized.proposedKeys.has(key)) {
        decisions[key] = makeDecision(key, value, "proposed", "planner", normalizedAnswers);
      } else if (raw) {
        decisions[key] = normalizedDecision(key, { ...raw, value }, normalizedAnswers);
      } else {
        const status = source === "template" || source === "extractor" ? "proposed" : "confirmed";
        decisions[key] = makeDecision(key, value, status, source, normalizedAnswers);
      }
    }
    if (!Object.keys(decisions).length && source === "legacy" && legacyAnswers && typeof legacyAnswers === "object") return createDraft("legacy", legacyAnswers);
    addDescriptionProposals(decisions, normalizedAnswers, rawDraft.intent?.rawDescription || normalized.values.description || legacyAnswers?.description);

    const dismissedQuestions = {};
    for (const [questionId, raw] of Object.entries(rawDraft.dismissedQuestions || {})) {
      if (byId[questionId] && raw && typeof raw === "object") {
        dismissedQuestions[questionId] = {
          ruleVersion: String(raw.ruleVersion || "1"),
          dependencyFingerprint: String(raw.dependencyFingerprint || "")
        };
      }
    }
    const shownQuestionIds = Array.isArray(rawDraft.shownQuestionIds)
      ? [...new Set(rawDraft.shownQuestionIds.filter((id) => byId[id]))].slice(0, QUESTION_LIMIT)
      : byId[rawDraft.activeQuestionId] ? [rawDraft.activeQuestionId] : [];
    const unresolvedProfileKeys = [...new Set([
      ...(Array.isArray(rawDraft.unresolvedProfileKeys) ? rawDraft.unresolvedProfileKeys : []),
      ...normalized.unresolvedProfileKeys
    ])].filter((key) => (key === "archetype" || key === "scale") && hasValue(normalized.values[byAnswerKey[key]?.customDetailKey]));
    return {
      version: DRAFT_VERSION,
      intent: {
        rawDescription: text(rawDraft.intent?.rawDescription || normalized.values.description || legacyAnswers?.description),
        source
      },
      decisions,
      activeQuestionId: byId[rawDraft.activeQuestionId] ? rawDraft.activeQuestionId : null,
      requiredQuestionIds: Array.isArray(rawDraft.requiredQuestionIds) ? rawDraft.requiredQuestionIds.filter((id) => byId[id]) : [],
      shownQuestionIds,
      dismissedQuestions,
      unresolvedProfileKeys
    };
  }

  function answerMap(draft) {
    return Object.fromEntries(Object.entries(draft?.decisions || {}).filter(([, decision]) => decision && hasValue(decision.value)).map(([key, decision]) => [key, clone(decision.value)]));
  }

  function resolveCustomQuestions(answers) {
    const matched = [];
    for (const rule of CUSTOM_BRANCH_RULES) {
      if (!rule.matches(answers)) continue;
      for (const rawQuestion of rule.questions || []) {
        const question = byId[rawQuestion.id] || rawQuestion;
        matched.push({
          ...question,
          branchId: rule.id,
          branchLabel: rule.label,
          branchRiskPriority: Number(rule.riskPriority || 100),
          ruleVersion: rule.version
        });
      }
    }
    matched.sort((left, right) => left.branchRiskPriority - right.branchRiskPriority || left.priority - right.priority || left.id.localeCompare(right.id));
    return {
      questions: matched.slice(0, CUSTOM_BRANCH_LIMIT),
      omittedQuestions: matched.slice(CUSTOM_BRANCH_LIMIT)
    };
  }

  function generatorProjection(values, customQuestions = []) {
    const projected = {};
    for (const [key, value] of Object.entries(values || {})) {
      if (key.startsWith("custom.")) continue;
      if (byAnswerKey[key] || ["featureChips", "flowDescription", "deliveryProfile", "archetypeProfile"].includes(key)) projected[key] = clone(value);
    }
    const customContext = customQuestions.map((question) => ({
      label: question.label,
      value: hasValue(values?.[question.answerKey]) ? clone(values[question.answerKey]) : question.safeDefault
    })).filter((item) => hasValue(item.value));
    if (customContext.length) projected.customContext = customContext;
    return projected;
  }

  function defaultAnswers(explicit, specApi, customQuestions) {
    const projected = generatorProjection(explicit, []);
    const inferred = specApi?.inferDefaults ? specApi.inferDefaults(projected) : {
      ...projected,
      archetype: projected.archetype || "web-app",
      scale: projected.scale || "hobby",
      frontend: projected.frontend || "Vanilla JS",
      backend: projected.backend || "None",
      database: projected.database || "None",
      hosting: projected.hosting || "GitHub Pages",
      genre: projected.genre || "minimal",
      authType: projected.authType || "None",
      screens: projected.screens || ["Home", "Dashboard", "Settings"]
    };
    const answers = {
      ...inferred,
      name: inferred.name || "Untitled App",
      description: inferred.description || "A focused application.",
      features: inferred.features || "Core application functionality.",
      audience: inferred.audience || "General users"
    };
    for (const question of customQuestions) {
      if (!hasValue(explicit[question.answerKey]) && hasValue(question.safeDefault)) answers[question.answerKey] = clone(question.safeDefault);
      else if (hasValue(explicit[question.answerKey])) answers[question.answerKey] = clone(explicit[question.answerKey]);
    }
    return answers;
  }

  function isDismissed(draft, questionId, explicit) {
    const dismissed = draft?.dismissedQuestions?.[questionId];
    if (!dismissed) return false;
    const current = fingerprint(dependencyValues(byId[questionId]?.answerKey || questionId, explicit));
    return dismissed.ruleVersion === String(byId[questionId]?.ruleVersion || "1") && dismissed.dependencyFingerprint === current;
  }

  function isUncertain(question, answers, draft, explicit, customIds) {
    const key = question.answerKey;
    if (hasValue(explicit[key]) || question.autoAsk === false) return false;
    if (customIds.has(question.id)) return true;
    const description = text(answers.description || draft?.intent?.rawDescription);
    if (key === "description") return description.length < 16;
    if (key === "name") return !description || description.length < 36;
    if (key === "features") return description.length < 90;
    if (key === "archetype" || key === "scale") return true;
    if (key === "audience") return description.length < 60;
    if (key === "industry") return /^(startup|production|enterprise)$/.test(String(answers.scale || ""));
    if (key === "security") return /^(production|enterprise)$/.test(String(answers.scale || ""));
    return false;
  }

  function questionCandidates(draft, answers, explicit, customQuestions, forcedQuestionIds = new Set()) {
    const customIds = new Set(customQuestions.map((question) => question.id));
    const available = [...QUESTIONS, ...customQuestions];
    return available.filter((question) => {
      const visible = customIds.has(question.id) || question.visibleWhen?.(answers) !== false;
      if (visible && forcedQuestionIds.has(question.id)) return true;
      return visible && isUncertain(question, answers, draft, explicit, customIds) && !isDismissed(draft, question.id, explicit);
    }).sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  }

  function boundedQuestions(draft, candidates) {
    const shown = [...new Set(draft.shownQuestionIds || [])].slice(0, QUESTION_LIMIT);
    const shownSet = new Set(shown);
    const retained = shown.map((id) => candidates.find((question) => question.id === id)).filter(Boolean);
    const remaining = Math.max(0, QUESTION_LIMIT - shown.length);
    const unseen = candidates.filter((question) => !shownSet.has(question.id)).slice(0, remaining);
    return [...retained, ...unseen];
  }

  function decisionNeedsReview(key, decision, explicit) {
    if (decision?.status !== "confirmed" || !decision.confirmedAgainst) return false;
    return decision.confirmedAgainst !== fingerprint(dependencyValues(key, explicit));
  }

  function nodeState(question, draft, explicit, answers, needsReviewKeys, customIds) {
    const key = question.answerKey;
    const visible = customIds.has(question.id) || question.visibleWhen?.(answers) !== false;
    if (!visible) return "locked";
    if (isDismissed(draft, question.id, explicit)) return "dismissed";
    if (needsReviewKeys.has(key)) return "review";
    const decision = draft.decisions[key];
    if (customIds.has(question.id) || ["archetypeDetail", "scaleDetail"].includes(key) || (key === "archetype" && hasValue(explicit.archetypeDetail)) || (key === "scale" && hasValue(explicit.scaleDetail))) return decision?.status === "proposed" ? "proposed" : "custom";
    if (decision?.status === "confirmed") return "confirmed";
    if (decision?.status === "proposed") return "proposed";
    return hasValue(answers[key]) ? "default" : "unanswered";
  }

  function buildGraph({ draft, explicit, answers, customQuestions, omittedCustomQuestions, requiredQuestionIds, needsReview, activeQuestionId }) {
    const customIds = new Set(customQuestions.map((question) => question.id));
    const omittedIds = new Set(omittedCustomQuestions.map((question) => question.id));
    const needsReviewKeys = new Set(needsReview.map((item) => item.key));
    const available = [...QUESTIONS, ...customQuestions, ...omittedCustomQuestions];
    const nodes = available.map((question) => {
      const dependencies = dependenciesFor(question.answerKey);
      const omitted = omittedIds.has(question.id);
      const visible = customIds.has(question.id) || omitted || question.visibleWhen?.(answers) !== false;
      const parentId = question.parentId || byAnswerKey[dependencies[0]]?.id || null;
      const required = requiredQuestionIds.includes(question.id);
      const resolvedState = nodeState(question, draft, explicit, answers, needsReviewKeys, customIds);
      return {
        id: question.id,
        questionId: question.id,
        answerKey: question.answerKey,
        parentId,
        label: question.label,
        section: question.section,
        state: omitted ? "locked" : required ? "required" : resolvedState,
        visible,
        locked: !visible || omitted,
        lockReason: omitted
          ? "A higher-risk custom decision used the interview limit; this path's conservative assumption is still included in the generated context."
          : visible ? "" : `Available after ${dependencies.map((key) => byAnswerKey[key]?.label || key).join(", ") || "earlier scope choices"}.`,
        custom: customIds.has(question.id) || omitted || ["archetypeDetail", "scaleDetail"].includes(question.answerKey),
        omitted,
        required,
        branchId: question.branchId || null,
        dependsOn: dependencies,
        affects: clone(question.affects || []),
        value: clone(explicit[question.answerKey] ?? answers[question.answerKey]),
        source: draft.decisions[question.answerKey]?.source || "default"
      };
    });
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = nodes.flatMap((node) => node.dependsOn.map((key) => byAnswerKey[key]?.id).filter((id) => id && nodeIds.has(id)).map((from) => ({ from, to: node.id, kind: "depends-on" })));
    const treeEdges = nodes.filter((node) => node.parentId && nodeIds.has(node.parentId)).map((node) => ({ from: node.parentId, to: node.id, kind: "tree" }));
    const unlocked = nodes.filter((node) => !node.locked);
    const completed = unlocked.filter((node) => ["confirmed", "custom", "dismissed"].includes(node.state)).length;
    const assumptions = unlocked.filter((node) => ["default", "proposed"].includes(node.state)).length;
    const customRemaining = unlocked.filter((node) => node.branchId && !["confirmed", "custom", "dismissed"].includes(node.state)).length;
    const reviewRemaining = needsReview.length;
    const requiredRemaining = requiredQuestionIds.length;
    const percent = unlocked.length ? Math.round((completed / unlocked.length) * 100) : 100;
    const queueEligible = requiredRemaining === 0 && reviewRemaining === 0;
    const readinessLabel = requiredRemaining
      ? `Blocked by ${requiredRemaining} required decision${requiredRemaining === 1 ? "" : "s"}`
      : reviewRemaining
        ? `Review ${reviewRemaining} affected decision${reviewRemaining === 1 ? "" : "s"}`
        : assumptions
          ? `Ready with ${assumptions} visible assumption${assumptions === 1 ? "" : "s"}`
          : "Ready with confirmed decisions";
    return {
      version: 1,
      supportsCustomChoices: true,
      nodes,
      edges,
      treeEdges,
      focusId: activeQuestionId,
      progress: { completed, total: unlocked.length, percent, assumptions, customRemaining, customOmitted: omittedCustomQuestions.length, requiredRemaining, reviewRemaining },
      readiness: { queueEligible, required: requiredRemaining, review: reviewRemaining, label: readinessLabel },
      omittedCustomBranches: omittedCustomQuestions.map((question) => ({
        id: question.id,
        branchId: question.branchId,
        label: question.label,
        safeDefault: clone(question.safeDefault),
        reason: question.reason,
        affects: clone(question.affects || [])
      }))
    };
  }

  function resolveDraft(rawDraft, options = {}) {
    const draft = migrateDraft(rawDraft) || createDraft("user", {});
    const explicit = answerMap(draft);
    const customResolution = resolveCustomQuestions(explicit);
    const customQuestions = customResolution.questions;
    const omittedCustomQuestions = customResolution.omittedQuestions;
    const allMatchedCustomQuestions = [...customQuestions, ...omittedCustomQuestions];
    const answers = defaultAnswers(explicit, options.specApi || global.AISQSpec, allMatchedCustomQuestions);
    const defaults = {};
    for (const [key, value] of Object.entries(answers)) if (!hasValue(explicit[key])) defaults[key] = clone(value);

    const needsReview = [];
    for (const [key, decision] of Object.entries(draft.decisions || {})) {
      if (decisionNeedsReview(key, decision, explicit)) needsReview.push({ key, reason: "An upstream decision changed." });
    }
    const forcedQuestionIds = new Set((draft.unresolvedProfileKeys || []).filter((key) => hasValue(explicit[byAnswerKey[key]?.customDetailKey])));
    const candidates = questionCandidates(draft, answers, explicit, customQuestions, forcedQuestionIds);
    const questions = boundedQuestions(draft, candidates);
    const requiredQuestionIds = candidates.filter((question) => forcedQuestionIds.has(question.id) || (!hasValue(answers[question.answerKey]) && !hasValue(question.safeDefault))).map((question) => question.id);
    const profile = (options.specApi || global.AISQSpec)?.normalizeProjectProfile?.(generatorProjection(answers, allMatchedCustomQuestions));
    if (profile?.requiresScaleConfirmation && !requiredQuestionIds.includes("scale")) requiredQuestionIds.push("scale");
    const activeQuestionId = draft.activeQuestionId && byId[draft.activeQuestionId]
      ? draft.activeQuestionId
      : questions[0]?.id || null;
    draft.activeQuestionId = activeQuestionId;
    draft.requiredQuestionIds = [...requiredQuestionIds];

    const rationales = {};
    const effects = {};
    const dependencies = {};
    for (const question of [...QUESTIONS, ...allMatchedCustomQuestions]) {
      rationales[question.answerKey] = question.reason;
      effects[question.answerKey] = clone(question.affects || []);
      dependencies[question.answerKey] = [...dependenciesFor(question.answerKey)];
    }
    const graph = buildGraph({ draft, explicit, answers, customQuestions, omittedCustomQuestions, requiredQuestionIds, needsReview, activeQuestionId });
    const generatedAnswers = generatorProjection(answers, allMatchedCustomQuestions);
    const stageSelection = options.specApi?.resolveStages ? options.specApi.resolveStages(generatedAnswers) : [];
    return {
      draft,
      answers,
      explicit,
      defaults,
      openDecisions: questions.map((question) => question.answerKey),
      questions,
      customQuestions,
      omittedCustomQuestions,
      requiredQuestionIds,
      activeQuestionId,
      needsReview,
      rationales,
      effects,
      dependencies,
      decisionCoverage: graph.progress.percent / 100,
      confidence: graph.progress.percent / 100,
      graph,
      stageSelection,
      generatedAnswers,
      warnings: profile?.warnings || [],
      needsReviewFlag: needsReview.length > 0
    };
  }

  function setDecision(rawDraft, key, value, options = {}) {
    if (!byAnswerKey[key]) throw new Error(`Unknown plan decision: ${key}`);
    const draft = migrateDraft(rawDraft) || createDraft("user", {});
    const next = clone(draft);
    if (!hasValue(value)) delete next.decisions[key];
    else {
      const answers = answerMap(next);
      answers[key] = clone(value);
      next.decisions[key] = makeDecision(key, value, options.status || "confirmed", options.source || "user", answers);
    }
    if (recognizedOption(key, value)) next.unresolvedProfileKeys = (next.unresolvedProfileKeys || []).filter((item) => item !== key);
    next.activeQuestionId = null;
    return next;
  }

  function setCustomChoice(rawDraft, key, rawValue, canonicalValue, options = {}) {
    const question = byAnswerKey[key];
    if (!question?.allowCustom || !question.customDetailKey) throw new Error(`Decision does not support a custom value: ${key}`);
    if (!recognizedOption(key, canonicalValue)) throw new Error(`Unsupported canonical profile for ${key}`);
    const detail = text(rawValue);
    if (!detail) throw new Error(`Custom ${key} requires a description`);
    const draft = migrateDraft(rawDraft) || createDraft("user", {});
    const next = clone(draft);
    const answers = answerMap(next);
    answers[key] = canonicalValue;
    answers[question.customDetailKey] = detail;
    next.decisions[key] = makeDecision(key, canonicalValue, options.status || "confirmed", options.source || "user", answers);
    next.decisions[question.customDetailKey] = makeDecision(question.customDetailKey, detail, options.status || "confirmed", options.source || "user", answers);
    next.unresolvedProfileKeys = (next.unresolvedProfileKeys || []).filter((item) => item !== key);
    next.activeQuestionId = null;
    return next;
  }

  function clearCustomChoice(rawDraft, key, canonicalValue, options = {}) {
    const question = byAnswerKey[key];
    if (!question?.allowCustom) return setDecision(rawDraft, key, canonicalValue, options);
    const next = setDecision(rawDraft, key, canonicalValue, options);
    delete next.decisions[question.customDetailKey];
    next.unresolvedProfileKeys = (next.unresolvedProfileKeys || []).filter((item) => item !== key);
    next.activeQuestionId = null;
    return next;
  }

  function setActiveQuestion(rawDraft, questionId) {
    if (questionId !== null && !byId[questionId]) throw new Error(`Unknown plan question: ${questionId}`);
    const draft = migrateDraft(rawDraft) || createDraft("user", {});
    const next = clone(draft);
    next.activeQuestionId = questionId;
    return next;
  }

  function markQuestionShown(rawDraft, questionId) {
    if (!byId[questionId]) throw new Error(`Unknown plan question: ${questionId}`);
    const draft = migrateDraft(rawDraft) || createDraft("user", {});
    const next = clone(draft);
    next.shownQuestionIds = [...new Set([...(next.shownQuestionIds || []), questionId])].slice(0, QUESTION_LIMIT);
    next.activeQuestionId = questionId;
    return next;
  }

  function approveProposals(rawDraft) {
    const draft = migrateDraft(rawDraft) || createDraft("user", {});
    const next = clone(draft);
    const answers = answerMap(next);
    for (const [key, decision] of Object.entries(next.decisions)) {
      if (decision.status === "proposed") {
        decision.status = "confirmed";
        decision.source = decision.source || "planner";
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
    const explicit = answerMap(next);
    const question = byId[questionId];
    next.dismissedQuestions[questionId] = {
      ruleVersion: String(question.ruleVersion || "1"),
      dependencyFingerprint: fingerprint(dependencyValues(question.answerKey, explicit))
    };
    if (next.activeQuestionId === questionId) next.activeQuestionId = null;
    return next;
  }

  function planToSpecAnswers(rawDraft, options = {}) {
    return resolveDraft(rawDraft, options).generatedAnswers;
  }

  function approvalFingerprint(rawDraft, options = {}) {
    const resolved = resolveDraft(rawDraft, options);
    return fingerprint({
      version: resolved.draft.version,
      decisions: resolved.draft.decisions,
      dismissedQuestions: resolved.draft.dismissedQuestions,
      unresolvedProfileKeys: resolved.draft.unresolvedProfileKeys,
      requiredQuestionIds: resolved.requiredQuestionIds,
      needsReview: resolved.needsReview,
      generatedAnswers: resolved.generatedAnswers
    });
  }

  const api = {
    DRAFT_VERSION,
    QUESTION_LIMIT,
    CUSTOM_BRANCH_LIMIT,
    GENERATED_BRANCH_LIMIT,
    BRANCH_PROVIDER_CONTRACT,
    QUESTIONS,
    CUSTOM_BRANCH_RULES,
    CUSTOM_QUESTIONS,
    fingerprint,
    validateBranchProposal,
    inferDescriptionDecisions,
    createDraft,
    migrateDraft,
    setDecision,
    setCustomChoice,
    clearCustomChoice,
    setActiveQuestion,
    markQuestionShown,
    resolveDraft,
    approveProposals,
    dismissQuestion,
    planToSpecAnswers,
    approvalFingerprint
  };
  global.AISQPlan = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
