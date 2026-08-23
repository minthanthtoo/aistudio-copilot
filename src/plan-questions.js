(function initAISQPlanQuestions(global) {
  "use strict";

  const always = () => true;
  const has = (key) => (answers) => answers?.[key] !== undefined && answers?.[key] !== null && String(answers[key]).trim() !== "";
  const scaleAtLeast = (minimum) => (answers) => {
    const order = { hobby: 0, mvp: 1, startup: 2, production: 3, enterprise: 4 };
    const selected = order[answers?.scale] !== undefined
      ? answers.scale
      : order[answers?.deliveryProfile] !== undefined
        ? answers.deliveryProfile
        : (answers?.scale || answers?.scaleDetail) ? "production" : "hobby";
    return (order[selected] ?? 0) >= minimum;
  };

  // This catalog is deliberately data-only.  The engine owns ranking, caps,
  // provenance, and dependency fingerprints; the UI only renders these rows.
  const QUESTIONS = Object.freeze([
    {
      id: "name",
      section: "Idea",
      answerKey: "name",
      label: "What should the app be called?",
      inputType: "text",
      options: [],
      visibleWhen: always,
      priority: 10,
      reason: "A stable name keeps the generated plan and queue easy to identify.",
      affects: ["preface", "queueLabel"]
    },
    {
      id: "description",
      section: "Idea",
      answerKey: "description",
      label: "What is the one-sentence outcome this app must deliver?",
      inputType: "textarea",
      options: [],
      visibleWhen: always,
      priority: 5,
      reason: "The outcome is the source of truth for every later assumption.",
      affects: ["preface", "stages", "features"]
    },
    {
      id: "archetype",
      section: "Scope",
      answerKey: "archetype",
      label: "Which kind of product is this closest to?",
      inputType: "select",
      options: ["web-app", "saas", "dashboard", "e-commerce", "portfolio", "mobile-app", "game", "3d-cad", "cloud-app", "enterprise", "api-service", "ai-ml-app", "agent-swarm"],
      allowCustom: true,
      customDetailKey: "archetypeDetail",
      visibleWhen: always,
      priority: 20,
      reason: "The archetype changes the default screens, workflow, and implementation stages.",
      affects: ["screens", "stages", "preface"]
    },
    {
      id: "archetypeDetail",
      section: "Scope",
      answerKey: "archetypeDetail",
      label: "How is this custom product category different?",
      inputType: "textarea",
      options: [],
      visibleWhen: has("archetypeDetail"),
      priority: 21,
      autoAsk: false,
      parentId: "archetype",
      reason: "The original category wording is preserved so generic generator defaults do not erase product intent.",
      affects: ["preface", "customBranches", "features", "stages"]
    },
    {
      id: "scale",
      section: "Scope",
      answerKey: "scale",
      label: "How far should the first version go?",
      inputType: "select",
      options: ["hobby", "mvp", "startup", "production", "enterprise"],
      allowCustom: true,
      customDetailKey: "scaleDetail",
      visibleWhen: always,
      priority: 25,
      reason: "Scale changes security, testing, deployment, and enterprise stages.",
      affects: ["stages", "architecture", "risk"]
    },
    {
      id: "scaleDetail",
      section: "Scope",
      answerKey: "scaleDetail",
      label: "What does this custom delivery size mean for the project?",
      inputType: "textarea",
      options: [],
      visibleWhen: has("scaleDetail"),
      priority: 26,
      autoAsk: false,
      parentId: "scale",
      reason: "Custom scope wording is kept alongside a canonical delivery profile so risk and operational work remain explicit.",
      affects: ["preface", "stages", "architecture", "risk"]
    },
    {
      id: "features",
      section: "Scope",
      answerKey: "features",
      label: "Which capabilities are essential in the first build?",
      inputType: "textarea",
      options: [],
      visibleWhen: always,
      priority: 45,
      reason: "Essential capabilities determine the core workflow and data model.",
      affects: ["stages", "screens", "dataModel"]
    },
    {
      id: "featureChips",
      section: "Scope",
      answerKey: "featureChips",
      label: "Selected feature modules",
      inputType: "tags",
      options: [],
      visibleWhen: has("featureChips"),
      priority: 46,
      autoAsk: false,
      parentId: "features",
      reason: "Selected modules supplement the written core feature description without duplicating it.",
      affects: ["features", "stages"]
    },
    {
      id: "screens",
      section: "Scope",
      answerKey: "screens",
      label: "Which screens or routes are essential?",
      inputType: "textarea",
      options: [],
      visibleWhen: (answers) => Boolean(answers?.archetype),
      priority: 35,
      reason: "Explicit routes prevent the generator from inventing a larger surface.",
      affects: ["screens", "navigation"]
    },
    {
      id: "audience",
      section: "Experience",
      answerKey: "audience",
      label: "Who is the primary user?",
      inputType: "text",
      options: [],
      visibleWhen: always,
      priority: 50,
      reason: "Audience changes language, examples, accessibility priorities, and UX assumptions.",
      affects: ["preface", "ux"]
    },
    {
      id: "genre",
      section: "Experience",
      answerKey: "genre",
      label: "What visual direction should guide the interface?",
      inputType: "select",
      options: ["minimal", "production", "dashboard", "playful", "editorial", "brutalist", "glassmorphism", "neon", "retro"],
      visibleWhen: always,
      priority: 50,
      reason: "Visual direction affects the generated design system and component language.",
      affects: ["preface", "ui"]
    },
    {
      id: "mobileFirst",
      section: "Experience",
      answerKey: "mobileFirst",
      label: "Should the experience be mobile-first?",
      inputType: "boolean",
      options: [true, false],
      visibleWhen: always,
      priority: 55,
      reason: "Mobile-first changes navigation, tap targets, and responsive layout constraints.",
      affects: ["ui", "accessibility"]
    },
    {
      id: "darkMode",
      section: "Experience",
      answerKey: "darkMode",
      label: "Should dark mode be included?",
      inputType: "boolean",
      options: [true, false],
      visibleWhen: always,
      priority: 60,
      reason: "Theme support changes tokens, contrast checks, and UI states.",
      affects: ["ui", "accessibility"]
    },
    {
      id: "productionQuality",
      section: "Experience",
      answerKey: "productionQuality",
      label: "Should this target production-grade polish now?",
      inputType: "boolean",
      options: [true, false],
      visibleWhen: always,
      priority: 65,
      reason: "Production quality enables stricter accessibility, error, and loading requirements.",
      affects: ["stages", "accessibility"]
    },
    {
      id: "frontend",
      section: "Architecture",
      answerKey: "frontend",
      label: "Which frontend stack should be used?",
      inputType: "select",
      options: ["React", "Vue", "Svelte", "Vanilla JS", "Next.js 14 App Router", "Next.js", "Astro", "React Native", "Angular", "None"],
      visibleWhen: scaleAtLeast(1),
      priority: 70,
      reason: "The frontend choice affects scaffolding, routing, and component conventions.",
      affects: ["architecture", "stages"]
    },
    {
      id: "backend",
      section: "Architecture",
      answerKey: "backend",
      label: "Which backend or service layer should be used?",
      inputType: "select",
      options: ["Node.js", "Node.js + Express", "Python", "Python + FastAPI", "Go", "Firebase", "Supabase", "Next.js API Routes", "Node.js + NestJS", "Java Spring Boot", "None"],
      visibleWhen: scaleAtLeast(1),
      priority: 75,
      reason: "The backend choice affects data access, auth, and deployment stages.",
      affects: ["architecture", "dataModel", "stages"]
    },
    {
      id: "database",
      section: "Architecture",
      answerKey: "database",
      label: "Which data store should be used?",
      inputType: "select",
      options: ["PostgreSQL", "PostgreSQL (Supabase)", "PostgreSQL (pgvector)", "MongoDB", "MySQL", "Redis", "Firestore", "None"],
      visibleWhen: scaleAtLeast(1),
      priority: 80,
      reason: "The data store affects schema, access control, and seed-data stages.",
      affects: ["architecture", "dataModel", "security"]
    },
    {
      id: "hosting",
      section: "Delivery",
      answerKey: "hosting",
      label: "Where should the first version be deployed?",
      inputType: "select",
      options: ["Vercel", "Netlify", "AWS", "Render", "App Stores", "GitHub Pages"],
      visibleWhen: scaleAtLeast(2),
      priority: 85,
      reason: "Hosting affects deployment configuration, secrets, and operational assumptions.",
      affects: ["deployment", "stages"]
    },
    {
      id: "industry",
      section: "Trust",
      answerKey: "industry",
      label: "Is there an industry or domain constraint?",
      inputType: "text",
      options: [],
      visibleWhen: scaleAtLeast(2),
      priority: 35,
      reason: "Industry context can add compliance, accessibility, and data-handling requirements.",
      affects: ["preface", "security", "risk"]
    },
    {
      id: "authType",
      section: "Trust",
      answerKey: "authType",
      label: "What authentication approach is required?",
      inputType: "select",
      options: ["None", "Email & Password", "OAuth + Email & Password"],
      visibleWhen: scaleAtLeast(1),
      priority: 95,
      reason: "Authentication affects security, data access, and user journeys.",
      affects: ["security", "screens", "stages"]
    },
    {
      id: "security",
      section: "Trust",
      answerKey: "security",
      label: "Are there specific security requirements?",
      inputType: "textarea",
      options: [],
      visibleWhen: scaleAtLeast(3),
      priority: 40,
      reason: "Explicit security requirements must be visible before a production plan is approved.",
      affects: ["security", "risk"]
    },
    {
      id: "stageOverrides",
      section: "Delivery",
      answerKey: "stageOverrides",
      label: "Should any generated stages be excluded?",
      inputType: "stageOverrides",
      options: [],
      visibleWhen: scaleAtLeast(1),
      priority: 110,
      reason: "Stage overrides change delivery scope and must be reviewed explicitly.",
      affects: ["stages"]
    },
    {
      id: "flowDescription",
      section: "Delivery",
      answerKey: "flowDescription",
      label: "Describe any special navigation or interaction flow",
      inputType: "textarea",
      options: [],
      visibleWhen: has("flowDescription"),
      priority: 111,
      autoAsk: false,
      parentId: "stageOverrides",
      reason: "A custom flow changes navigation and interaction requirements in the generated foundation.",
      affects: ["navigation", "stages", "preface"]
    }
  ]);

  // Deterministic custom branches are intentionally bounded and data-only.
  // They add tailored decision nodes without granting generated text direct
  // authority over the final specification.
  const CUSTOM_BRANCH_RULES = Object.freeze([
    {
      id: "regulated-domain",
      version: "1",
      riskPriority: 30,
      label: "Regulated or sensitive domain",
      matches: (answers) => /health|medical|clinical|finance|bank|payment|insurance|education|student|legal|government|regulated/i.test(`${answers?.archetypeDetail || ""} ${answers?.scaleDetail || ""}`),
      questions: [
        {
          id: "custom.regulated.data-handling",
          section: "Custom path",
          answerKey: "custom.regulated.dataHandling",
          label: "What sensitive or regulated data will this product handle?",
          inputType: "textarea",
          options: [],
          priority: 31,
          parentId: "archetypeDetail",
          dependsOn: ["archetypeDetail", "scaleDetail"],
          safeDefault: "Treat personal and domain data as sensitive, minimize collection, and define retention explicitly.",
          reason: "Data sensitivity changes access control, audit, retention, and compliance requirements.",
          affects: ["security", "dataModel", "risk", "stages"]
        },
        {
          id: "custom.regulated.human-approval",
          section: "Custom path",
          answerKey: "custom.regulated.humanApproval",
          label: "Where must a person review or approve consequential decisions?",
          inputType: "textarea",
          options: [],
          priority: 32,
          parentId: "custom.regulated.data-handling",
          dependsOn: ["archetypeDetail"],
          safeDefault: "Require human approval before consequential or irreversible actions.",
          reason: "Human oversight changes workflow states, permissions, evidence, and recovery design.",
          affects: ["workflow", "security", "audit", "stages"]
        }
      ]
    },
    {
      id: "realtime-collaboration",
      version: "1",
      riskPriority: 40,
      label: "Real-time collaboration",
      matches: (answers) => /real[ -]?time|live collabor|multiplayer|synchronous|shared workspace|presence/i.test(`${answers?.archetypeDetail || ""} ${answers?.scaleDetail || ""}`),
      questions: [
        {
          id: "custom.realtime.consistency",
          section: "Custom path",
          answerKey: "custom.realtime.consistency",
          label: "How should simultaneous edits and temporary disconnections behave?",
          inputType: "textarea",
          options: [],
          priority: 33,
          parentId: "archetypeDetail",
          dependsOn: ["archetypeDetail"],
          safeDefault: "Preserve edits, show presence, resolve conflicts deterministically, and recover after reconnect.",
          reason: "Concurrency expectations determine synchronization, conflict resolution, and offline behavior.",
          affects: ["architecture", "dataModel", "workflow", "testing"]
        }
      ]
    },
    {
      id: "physical-systems",
      version: "1",
      riskPriority: 10,
      label: "Physical or device-connected system",
      matches: (answers) => /iot|hardware|sensor|robot|device|drone|embedded|physical/i.test(`${answers?.archetypeDetail || ""} ${answers?.scaleDetail || ""}`),
      questions: [
        {
          id: "custom.physical.failure-safety",
          section: "Custom path",
          answerKey: "custom.physical.failureSafety",
          label: "What must happen when a device, network, or command fails?",
          inputType: "textarea",
          options: [],
          priority: 34,
          parentId: "archetypeDetail",
          dependsOn: ["archetypeDetail"],
          safeDefault: "Fail safely, preserve an audit trail, expose device state, and require confirmation before retrying physical actions.",
          reason: "Physical side effects require explicit safety, idempotency, and recovery behavior.",
          affects: ["architecture", "safety", "workflow", "testing"]
        }
      ]
    },
    {
      id: "agentic-system",
      version: "1",
      riskPriority: 20,
      label: "Agentic or autonomous system",
      matches: (answers) => /agent|autonomous|swarm|tool[ -]?using|copilot/i.test(`${answers?.archetypeDetail || ""} ${answers?.scaleDetail || ""}`),
      questions: [
        {
          id: "custom.agent.authority",
          section: "Custom path",
          answerKey: "custom.agent.authority",
          label: "Which actions may the agent take without human approval?",
          inputType: "textarea",
          options: [],
          priority: 35,
          parentId: "archetypeDetail",
          dependsOn: ["archetypeDetail"],
          safeDefault: "Keep external side effects proposal-only until a person approves them.",
          reason: "Authority boundaries determine consent, evidence, retries, and recovery requirements.",
          affects: ["authority", "security", "workflow", "audit"]
        }
      ]
    },
    {
      id: "generic-custom-intent",
      version: "1",
      riskPriority: 100,
      label: "Custom product intent",
      matches: (answers) => Boolean(String(answers?.archetypeDetail || answers?.scaleDetail || "").trim()),
      questions: [
        {
          id: "custom.generic.differentiator",
          section: "Custom path",
          answerKey: "custom.generic.differentiator",
          label: "What must this product do differently from the closest build profile?",
          inputType: "textarea",
          options: [],
          priority: 36,
          parentId: "archetype",
          dependsOn: ["archetypeDetail", "scaleDetail"],
          safeDefault: "Preserve the custom intent explicitly and use the closest build profile only for implementation structure.",
          reason: "A custom label is useful only when its meaningful difference reaches the generated workflow and requirements.",
          affects: ["preface", "features", "workflow", "stages"]
        },
        {
          id: "custom.generic.success",
          section: "Custom path",
          answerKey: "custom.generic.success",
          label: "Which client outcome proves this custom scope is successful?",
          inputType: "textarea",
          options: [],
          priority: 37,
          parentId: "custom.generic.differentiator",
          dependsOn: ["archetypeDetail", "scaleDetail"],
          safeDefault: "Validate the primary user outcome before expanding the custom scope.",
          reason: "A concrete success condition keeps a novel category from becoming an unbounded generic build.",
          affects: ["preface", "acceptanceCriteria", "testing", "stages"]
        }
      ]
    }
  ]);

  const CUSTOM_QUESTIONS = Object.freeze(CUSTOM_BRANCH_RULES.flatMap((rule) => rule.questions.map((question) => Object.freeze({ ...question, branchId: rule.id, ruleVersion: rule.version }))));
  const ALL_QUESTIONS = Object.freeze([...QUESTIONS, ...CUSTOM_QUESTIONS]);
  const byId = Object.freeze(Object.fromEntries(ALL_QUESTIONS.map((question) => [question.id, question])));
  const byAnswerKey = Object.freeze(Object.fromEntries(ALL_QUESTIONS.map((question) => [question.answerKey, question])));
  const api = { QUESTIONS, CUSTOM_BRANCH_RULES, CUSTOM_QUESTIONS, ALL_QUESTIONS, byId, byAnswerKey };
  global.AISQPlanQuestions = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
