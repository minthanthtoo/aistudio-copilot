(function initAISQPlanQuestions(global) {
  "use strict";

  const always = () => true;
  const has = (key) => (answers) => answers?.[key] !== undefined && answers?.[key] !== null && String(answers[key]).trim() !== "";
  const scaleAtLeast = (minimum) => (answers) => {
    const order = { hobby: 0, mvp: 1, startup: 2, production: 3, enterprise: 4 };
    return (order[answers?.scale] ?? 0) >= minimum;
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
      options: ["web-app", "saas", "dashboard", "e-commerce", "portfolio", "mobile-app", "game", "api-service", "ai-ml-app", "agent-swarm"],
      visibleWhen: always,
      priority: 20,
      reason: "The archetype changes the default screens, workflow, and implementation stages.",
      affects: ["screens", "stages", "preface"]
    },
    {
      id: "scale",
      section: "Scope",
      answerKey: "scale",
      label: "How far should the first version go?",
      inputType: "select",
      options: ["hobby", "mvp", "startup", "production", "enterprise"],
      visibleWhen: always,
      priority: 25,
      reason: "Scale changes security, testing, deployment, and enterprise stages.",
      affects: ["stages", "architecture", "risk"]
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
    }
  ]);

  const byId = Object.freeze(Object.fromEntries(QUESTIONS.map((question) => [question.id, question])));
  global.AISQPlanQuestions = { QUESTIONS, byId };
  if (typeof module !== "undefined" && module.exports) module.exports = { QUESTIONS, byId };
})(typeof globalThis !== "undefined" ? globalThis : this);
