(function initAISQSpec(global) {
  "use strict";

  const SCALES = ["hobby", "mvp", "startup", "production", "enterprise"];
  const SCALE_INDEX = { hobby: 0, mvp: 1, startup: 2, production: 3, enterprise: 4 };

  const ARCHETYPES = [
    { id: "web-app", label: "Web App", emoji: "🌐" },
    { id: "e-commerce", label: "E-Commerce", emoji: "🛒" },
    { id: "saas", label: "SaaS Platform", emoji: "📊" },
    { id: "ai-ml-app", label: "AI / ML App", emoji: "🤖" },
    { id: "portfolio", label: "Portfolio", emoji: "📁" },
    { id: "dashboard", label: "Dashboard", emoji: "📋" },
    { id: "mobile-app", label: "Mobile App", emoji: "📱" },
    { id: "game", label: "Game", emoji: "🎮" },
    { id: "3d-cad", label: "3D / CAD", emoji: "🏗️" },
    { id: "cloud-app", label: "Cloud App", emoji: "☁️" },
    { id: "enterprise", label: "Enterprise", emoji: "🏢" },
    { id: "api-service", label: "API Service", emoji: "⚡" },
    { id: "agent-swarm", label: "Agent Swarm", emoji: "🐝" }
  ];

  const GENRES = [
    { id: "minimal", label: "Minimal", description: "Minimalist, clean, lots of whitespace. Focus on typography and crisp layouts. Use a very constrained monochrome palette with perhaps one accent color." },
    { id: "corporate", label: "Corporate", description: "Professional, trustworthy, enterprise-grade. Use traditional layouts with solid navigation. Blue or neutral branding, clear CTA buttons, high-contrast text." },
    { id: "playful", label: "Playful", description: "Vibrant colors, rounded corners, bubbly typography, subtle micro-interactions, friendly copywriting, engaging and fun." },
    { id: "editorial", label: "Editorial", description: "Magazine-style layout, large serif typography mixed with clean sans-serif body text. Asymmetrical grids, large high-quality imagery, refined aesthetic." },
    { id: "dashboard", label: "Dashboard", description: "Data-dense but clear. Card-based layouts, robust sidebar navigation. Use subtle borders, light grays for grouping, and distinct categorical colors for charts and status badges." },
    { id: "glassmorphism", label: "Glassmorphism", description: "Translucent frosted-glass effects on cards and modals, colorful blurred gradient backgrounds, thin semi-transparent borders, floating UI elements." },
    { id: "brutalist", label: "Brutalist", description: "Raw, harsh, utilitarian. High-contrast colors (often black/white + neon), thick borders, monospaced or huge bold typography, visible grid lines." },
    { id: "hacker", label: "Hacker / Cyberpunk", description: "Dark mode native, neon green or magenta accents, monospaced terminal fonts, glowing effects, grid/matrix backgrounds, tech-focused aesthetic." },
    { id: "production", label: "Production (No Vibe-Coding)", description: "Focus exclusively on functional excellence, semantic HTML, comprehensive accessibility (WAI-ARIA), proper focus states, and scalable component architecture over stylistic flourishes." }
  ];

  const FEATURE_SUGGESTIONS = {
    "web-app": ["User Auth", "Profile Settings", "Search", "Pagination", "Notifications", "Social Share", "Comments", "File Upload"],
    "e-commerce": ["Product Catalog", "Shopping Cart", "Checkout", "Order Tracking", "Reviews", "Wishlist", "Search & Filters", "Vendor Portal", "Promo Codes"],
    "saas": ["User Auth", "Team Management", "Dashboard", "Billing Integration", "API Access", "Settings", "Notifications", "Analytics"],
    "ai-ml-app": ["Model Integration", "Prompt Input", "Chat History", "File Upload", "Streaming Responses", "Export Results", "System Prompts", "Feedback Loop"],
    "portfolio": ["Project Gallery", "About Me", "Contact Form", "Resume Download", "Blog Integration", "Testimonials", "Skill Matrix", "Social Links"],
    "dashboard": ["Data Grids", "Charts/Graphs", "Date Range Picker", "Export to CSV", "KPI Cards", "Dark Mode Toggle", "Customizable Widgets", "Activity Feed"],
    "mobile-app": ["Bottom Navigation", "Pull to Refresh", "Swipe Actions", "Push Notifications", "Offline Support", "Camera Access", "Location Services", "Biometric Auth"],
    "game": ["Game Loop", "Score Tracking", "Leaderboard", "Sound Effects", "Pause/Resume", "Settings Menu", "Tutorial", "Achievements"],
    "3d-cad": ["3D Viewport", "Object Hierarchy", "Material Editor", "Lighting Controls", "Export/Import (GLTF)", "Camera Controls", "Transform Gizmos", "Undo/Redo"],
    "cloud-app": ["Resource Provisioning", "Log Viewer", "Usage Metrics", "Role-Based Access", "Billing Alerts", "SSH Key Management", "API Tokens", "Environment Variables"],
    "enterprise": ["Single Sign-On (SSO)", "Audit Logs", "Complex Workflows", "Reporting", "Data Import/Export", "Advanced Search", "Custom Roles", "Compliance Tracking"],
    "api-service": ["Rate Limiting", "API Key Management", "Webhook Endpoints", "Swagger/OpenAPI Docs", "Usage Analytics", "SDK Generation", "Versioning", "Health Checks"],
    "agent-swarm": ["Agent Definitions", "Tool Registry", "Task Orchestration", "Memory Store", "Human-in-the-Loop", "Execution Logs", "State Management", "Metrics"]
  };

  const DEFAULT_STACKS = {
    "web-app": { frontend: "React + Tailwind CSS", backend: "Node.js + Express", database: "PostgreSQL", hosting: "Vercel" },
    "e-commerce": { frontend: "Next.js", backend: "Next.js API Routes", database: "PostgreSQL", hosting: "Vercel" },
    "saas": { frontend: "Next.js", backend: "Node.js + NestJS", database: "PostgreSQL", hosting: "AWS" },
    "ai-ml-app": { frontend: "React", backend: "Python + FastAPI", database: "Pinecone / Postgres (pgvector)", hosting: "Render" },
    "portfolio": { frontend: "Astro", backend: "None", database: "None", hosting: "GitHub Pages" },
    "dashboard": { frontend: "Vue.js", backend: "Node.js + Express", database: "MySQL", hosting: "Vercel" },
    "mobile-app": { frontend: "React Native", backend: "Firebase", database: "Firestore", hosting: "App Stores" },
    "game": { frontend: "Vanilla JS + Canvas API", backend: "Node.js (for multiplayer)", database: "Redis", hosting: "Vercel" },
    "3d-cad": { frontend: "React + Three.js", backend: "Python", database: "PostgreSQL", hosting: "Vercel" },
    "cloud-app": { frontend: "React", backend: "Go", database: "PostgreSQL", hosting: "AWS" },
    "enterprise": { frontend: "Angular", backend: "Java Spring Boot", database: "Oracle / PostgreSQL", hosting: "AWS" },
    "api-service": { frontend: "None", backend: "Go / Node.js", database: "PostgreSQL", hosting: "AWS" },
    "agent-swarm": { frontend: "React (Monitoring UI)", backend: "Python + LangChain/LlamaIndex", database: "PostgreSQL", hosting: "AWS" }
  };

  // Stage Builders
  function stageFoundation(answers) {
    const screensList = answers.screens && answers.screens.length ? answers.screens.map(s => `- ${s}`).join('\n') : "- Home\n- Dashboard\n- Settings";
    const navStructure = answers.flowDescription || "Standard application navigation layout.";
    
    return `
Implement the foundation and core navigation shell of the application.
This is the base that all other features will be built upon.

**Core Requirements:**
1. Setup the project structure using the specified tech stack (${answers.frontend}).
2. Implement the main application layout and routing.
3. Establish the navigation structure: ${navStructure}
4. Setup the foundational styling using the selected genre: ${answers.genre}.

**Screens to scaffold (empty shells with proper routing):**
${screensList}

**Implementation Details:**
- MUST include a top-level Layout component that handles common UI elements (navigation, footers, etc.).
- MUST set up global error boundaries and a 404 Not Found page.
- Ensure the routing handles both authenticated and unauthenticated states gracefully (placeholder logic if auth is not yet implemented).
- MUST verify that navigation works seamlessly between all scaffolded screens.
`;
  }

  function stageDataModel(answers) {
    return `
Implement the data model and backend services.

**Core Requirements:**
1. Design the database schema and define models/tables for the application using ${answers.database}.
2. Set up the backend framework (${answers.backend}) and establish database connections.
3. Create API routes or service layers to interact with the data.

**Specific Implementation:**
- Base the schema on the features described: ${answers.features || "Core entity models"}.
- Included features: ${(answers.featureChips || []).join(', ')}.
- Create migration scripts or schema definitions.
- Write realistic seed data scripts. Do NOT use purely "lorem ipsum" data; generate domain-specific realistic mock data.
- Setup typed query hooks or ORM integrations on the backend and frontend.

**Verify:**
- API endpoints can successfully perform CRUD operations.
- The seed data populates correctly.
`;
  }

  function stageCoreFeatures(answers) {
    return `
Implement the core functionality and features.

**Core Features to build:**
${answers.features || "Implement the primary application functionality."}
${answers.featureChips && answers.featureChips.length ? "Key Modules: " + answers.featureChips.join(", ") : ""}

**Implementation Details:**
- Each feature MUST include its relevant UI components and connect to the backend services created in the previous stage.
- Implement comprehensive input validation (both client-side and server-side).
- Handle all edge cases: loading states, error states, and empty states.
- Ensure state is managed properly across the application.
- All forms MUST have clear success and error feedback.

**Verify:**
- Users can successfully complete the primary workflows of the application.
`;
  }

  function stagePolish(answers) {
    const productionExtra = answers.productionQuality ? "\n- Implement rigorous Web Content Accessibility Guidelines (WCAG) compliance (keyboard navigation, ARIA attributes).\n- Optimize core web vitals and minimize bundle size." : "";
    
    return `
Apply polish and prepare the application for a high-quality user experience.

**Core Requirements:**
1. Perform a comprehensive responsive audit. Ensure flawless layout on mobile, tablet, and desktop views.
2. Polish animations, transitions, and micro-interactions according to the ${answers.genre} genre.
3. Ensure consistent typography, spacing, and color usage throughout all screens.

**Specific Implementation:**
- Implement global toast notifications for feedback.
- Review and refine all loading states (skeletons or spinners).
- Create helpful empty states for all lists/tables when no data is present.${productionExtra}
${answers.darkMode ? "- Verify dark mode styling is consistent and readable across all components." : ""}

**Verify:**
- Application looks and feels complete, responsive, and professional.
`;
  }

  function stageSecurity(answers) {
    return `
Implement security hardening and production-grade auth.

**Core Requirements:**
1. Implement the specified authentication method: ${answers.authType || "standard auth"}.
2. Set up Role-Based Access Control (RBAC).
3. Secure all API endpoints.

**Specific Implementation:**
- Implement robust CSRF and XSS protection.
- Setup proper rate limiting on the backend.
- Ensure all sensitive data (passwords, tokens) is properly hashed and encrypted.
- Implement session management and secure cookies.
${answers.compliance && answers.compliance.length ? `- Ensure architecture supports compliance requirements: ${answers.compliance.join(', ')}.` : ""}

**Verify:**
- Unauthorized access is strictly prevented at both the routing and API levels.
`;
  }

  function stageTesting(answers) {
    return `
Establish the testing strategy and implement the core test suite.

**Core Requirements:**
1. Setup testing frameworks (e.g., Jest, Cypress, Playwright).
2. Write unit tests for critical business logic and utility functions.
3. Write integration tests for API endpoints.
4. Write End-to-End (E2E) tests for the primary user workflows.

**Specific Implementation:**
- Aim for high test coverage on critical paths (e.g., authentication, checkout, main data mutations).
- Setup mock data and test environments.
- Implement component testing for complex UI elements.

**Verify:**
- The test suite runs successfully and catches simulated failures.
`;
  }

  function stageDeployment(answers) {
    return `
Configure deployment, CI/CD, and monitoring.

**Core Requirements:**
1. Prepare the application for deployment to ${answers.hosting}.
2. Write Dockerfiles or deployment configurations as needed.
3. Setup a CI/CD pipeline (e.g., GitHub Actions) to lint, test, and deploy.

**Specific Implementation:**
- Configure environment variables and secrets management.
- Setup basic monitoring and error logging (e.g., Sentry, Datadog, or cloud-native tools).
- Document deployment instructions in the README.

**Verify:**
- The build process succeeds without errors.
- The CI pipeline executes successfully.
`;
  }

  // Archetype-specific stages
  function stageShoppingFlow(answers) { return `Implement the e-commerce shopping flow: Cart management, checkout process, and payment gateway integration mock. Ensure robust state management for the cart and clear validation during checkout.`; }
  function stageVendorPortal(answers) { return `Implement the vendor portal: Dashboard for sellers to manage products, view orders, and track revenue. Include RBAC to separate vendor and admin views.`; }
  function stageAuthMultiTenant(answers) { return `Implement multi-tenancy: Strategy = ${answers.multiTenancy || 'shared-db'}. Build team creation, user invitation, and role management within a tenant. Ensure all data queries are tenant-scoped.`; }
  function stageBilling(answers) { return `Implement SaaS billing: Subscription tiers, payment method management, invoice history, and webhooks for subscription state changes.`; }
  function stageAIPipeline(answers) { return `Implement the AI Pipeline: Integration with the LLM API, prompt management, response streaming handling, and if required, embedding generation and RAG search logic.`; }
  function stageGameMechanics(answers) { return `Implement Game Mechanics: The core game loop, state management, input handling, basic physics/collision detection, and rendering updates.`; }
  function stageThreeJSScene(answers) { return `Implement the 3D Scene: Set up the Three.js viewport, camera controls, scene graph, lighting, and basic mesh rendering.`; }
  function stageModelingTools(answers) { return `Implement Modeling Tools: Raycasting for object selection, transform manipulators (translate, rotate, scale), and undo/redo history for scene changes.`; }
  function stageDataViz(answers) { return `Implement Data Visualization: Setup robust charting libraries, build reusable chart components, handle dynamic data updates, and implement interactive tooltips and legends.`; }
  function stageAgentDefs(answers) { return `Implement Agent Definitions: Define agent personas, configure tools/functions they can call, establish the memory store interface, and set up prompt templates.`; }
  function stageOrchestrator(answers) { return `Implement Agent Orchestrator: Build the routing logic to pass tasks between agents, manage shared state/context, and handle execution logging and error recovery.`; }
  function stageAPIEndpoints(answers) { return `Implement API Service Endpoints: Define REST or GraphQL schemas, setup routing controllers, implement request validation, and auto-generate Swagger/OpenAPI documentation.`; }

  const BLUEPRINTS = {
    "web-app": [
      { stage: stageFoundation, title: "Foundation & Navigation Shell", minScale: 0 },
      { stage: stageDataModel, title: "Data Model & Backend", minScale: 1 },
      { stage: stageCoreFeatures, title: "Core Features", minScale: 0 },
      { stage: stagePolish, title: "Polish & Production Readiness", minScale: 0 },
      { stage: stageSecurity, title: "Security & Auth Hardening", minScale: 3 },
      { stage: stageTesting, title: "Testing Strategy", minScale: 3 },
      { stage: stageDeployment, title: "Deployment & Infrastructure", minScale: 2 }
    ],
    "e-commerce": [
      { stage: stageFoundation, title: "Foundation & Navigation Shell", minScale: 0 },
      { stage: stageDataModel, title: "Data Model & Backend", minScale: 1 },
      { stage: stageShoppingFlow, title: "Shopping Flow & Payments", minScale: 0 },
      { stage: stageVendorPortal, title: "Vendor Portal & Management", minScale: 2 },
      { stage: stageCoreFeatures, title: "Search, Reviews & Wishlist", minScale: 0 },
      { stage: stagePolish, title: "Polish & Production Readiness", minScale: 0 },
      { stage: stageSecurity, title: "Security & PCI Compliance", minScale: 3 },
      { stage: stageTesting, title: "Testing Strategy", minScale: 3 },
      { stage: stageDeployment, title: "Deployment & Infrastructure", minScale: 2 }
    ],
    "saas": [
      { stage: stageFoundation, title: "Foundation & Navigation Shell", minScale: 0 },
      { stage: stageDataModel, title: "Data Model & Backend", minScale: 1 },
      { stage: stageAuthMultiTenant, title: "Multi-Tenancy & Teams", minScale: 1 },
      { stage: stageCoreFeatures, title: "Core SaaS Features", minScale: 0 },
      { stage: stageBilling, title: "Billing & Subscriptions", minScale: 2 },
      { stage: stagePolish, title: "Polish & Production Readiness", minScale: 0 },
      { stage: stageSecurity, title: "Security & Compliance", minScale: 3 },
      { stage: stageTesting, title: "Testing Strategy", minScale: 3 },
      { stage: stageDeployment, title: "Deployment & Infrastructure", minScale: 2 }
    ],
    "ai-ml-app": [
      { stage: stageFoundation, title: "Foundation & UI Shell", minScale: 0 },
      { stage: stageAIPipeline, title: "AI Pipeline & Integrations", minScale: 0 },
      { stage: stageDataModel, title: "Data Model & History", minScale: 1 },
      { stage: stageCoreFeatures, title: "Application Features", minScale: 0 },
      { stage: stagePolish, title: "Streaming UX & Polish", minScale: 0 },
      { stage: stageSecurity, title: "API Key Security & Rate Limiting", minScale: 3 },
      { stage: stageDeployment, title: "Deployment & Infrastructure", minScale: 2 }
    ],
    "portfolio": [
      { stage: stageFoundation, title: "Foundation & Layout", minScale: 0 },
      { stage: stageCoreFeatures, title: "Content Sections", minScale: 0 },
      { stage: stagePolish, title: "Animations & Polish", minScale: 0 }
    ],
    "dashboard": [
      { stage: stageFoundation, title: "Dashboard Shell & Nav", minScale: 0 },
      { stage: stageDataModel, title: "Data Model & APIs", minScale: 1 },
      { stage: stageDataViz, title: "Data Visualization & Grids", minScale: 0 },
      { stage: stageCoreFeatures, title: "Widgets & Features", minScale: 0 },
      { stage: stagePolish, title: "Polish & Optimization", minScale: 0 },
      { stage: stageDeployment, title: "Deployment", minScale: 2 }
    ],
    "mobile-app": [
      { stage: stageFoundation, title: "Mobile Foundation & Routing", minScale: 0 },
      { stage: stageDataModel, title: "Backend & Sync", minScale: 1 },
      { stage: stageCoreFeatures, title: "Core Mobile Features", minScale: 0 },
      { stage: stagePolish, title: "Gestures & Polish", minScale: 0 },
      { stage: stageSecurity, title: "Security", minScale: 3 },
      { stage: stageDeployment, title: "App Store Prep", minScale: 2 }
    ],
    "game": [
      { stage: stageFoundation, title: "Engine Setup & Asset Loader", minScale: 0 },
      { stage: stageGameMechanics, title: "Core Game Mechanics", minScale: 0 },
      { stage: stageDataModel, title: "Backend & Leaderboards", minScale: 1 },
      { stage: stagePolish, title: "Juice & Polish", minScale: 0 },
      { stage: stageDeployment, title: "Deployment", minScale: 2 }
    ],
    "3d-cad": [
      { stage: stageFoundation, title: "UI Shell & Toolbars", minScale: 0 },
      { stage: stageThreeJSScene, title: "3D Viewport Setup", minScale: 0 },
      { stage: stageModelingTools, title: "Modeling & Interaction Tools", minScale: 0 },
      { stage: stageDataModel, title: "Data Serialization & Backend", minScale: 1 },
      { stage: stagePolish, title: "Performance & Polish", minScale: 0 },
      { stage: stageDeployment, title: "Deployment", minScale: 2 }
    ],
    "cloud-app": [
      { stage: stageFoundation, title: "Foundation & Routing", minScale: 0 },
      { stage: stageDataModel, title: "Data Model & Control Plane", minScale: 1 },
      { stage: stageCoreFeatures, title: "Cloud Features", minScale: 0 },
      { stage: stagePolish, title: "Polish", minScale: 0 },
      { stage: stageSecurity, title: "Identity & Access Management", minScale: 3 },
      { stage: stageDeployment, title: "Deployment & IaC", minScale: 2 }
    ],
    "enterprise": [
      { stage: stageFoundation, title: "Foundation & Layout", minScale: 0 },
      { stage: stageDataModel, title: "Data Model & APIs", minScale: 1 },
      { stage: stageCoreFeatures, title: "Enterprise Workflows", minScale: 0 },
      { stage: stagePolish, title: "Accessibility & Polish", minScale: 0 },
      { stage: stageSecurity, title: "Advanced Security & Audit", minScale: 3 },
      { stage: stageTesting, title: "Testing Strategy", minScale: 3 },
      { stage: stageDeployment, title: "Infrastructure & CI/CD", minScale: 2 }
    ],
    "api-service": [
      { stage: stageFoundation, title: "Project Setup & Config", minScale: 0 },
      { stage: stageDataModel, title: "Data Model & ORM", minScale: 1 },
      { stage: stageAPIEndpoints, title: "Endpoints & Routing", minScale: 0 },
      { stage: stageSecurity, title: "Auth & Rate Limiting", minScale: 3 },
      { stage: stageTesting, title: "API Testing", minScale: 3 },
      { stage: stageDeployment, title: "Deployment", minScale: 2 }
    ],
    "agent-swarm": [
      { stage: stageFoundation, title: "Project Setup & Memory UI", minScale: 0 },
      { stage: stageDataModel, title: "Vector DB & Storage", minScale: 1 },
      { stage: stageAgentDefs, title: "Agent Definitions", minScale: 0 },
      { stage: stageOrchestrator, title: "Orchestrator & Routing", minScale: 0 },
      { stage: stagePolish, title: "Logging & Observability", minScale: 0 },
      { stage: stageDeployment, title: "Deployment", minScale: 2 }
    ]
  };

  function inferDefaults(answers) {
    const arch = answers.archetype || "web-app";
    const scale = answers.scale || "hobby";
    const scaleIdx = SCALE_INDEX[scale] || 0;
    
    let inferred = { ...answers };

    if (!inferred.archetype) inferred.archetype = arch;
    if (!inferred.scale) inferred.scale = scale;

    const defStack = DEFAULT_STACKS[arch] || DEFAULT_STACKS["web-app"];
    if (!inferred.frontend) inferred.frontend = defStack.frontend;
    if (!inferred.backend) inferred.backend = defStack.backend;
    if (!inferred.database) inferred.database = defStack.database;
    if (!inferred.hosting) inferred.hosting = defStack.hosting;

    if (!inferred.genre) {
      if (arch === "portfolio") inferred.genre = "minimal";
      else if (arch === "dashboard") inferred.genre = "dashboard";
      else if (scale === "enterprise" || scale === "production") inferred.genre = "production";
      else inferred.genre = "minimal";
    }

    if (!inferred.authType) {
      if (scaleIdx === 0) inferred.authType = "none";
      else if (scaleIdx <= 2) inferred.authType = "basic";
      else inferred.authType = "oauth";
    }
    
    if (!inferred.screens || inferred.screens.length === 0) {
       if (arch === "e-commerce") inferred.screens = ["Home", "Product Listing", "Product Detail", "Cart", "Checkout"];
       else if (arch === "saas") inferred.screens = ["Landing Page", "Login/Signup", "Dashboard", "Settings", "Billing"];
       else inferred.screens = ["Home", "Dashboard", "Settings"];
    }

    return inferred;
  }

  function getVisibleSections(answers) {
    const scale = answers.scale || "hobby";
    const scaleIdx = SCALE_INDEX[scale] || 0;
    
    return {
      features: true,
      design: true,
      screens: true,
      techStack: scaleIdx >= 1,
      security: scaleIdx >= 3,
      advanced: scaleIdx >= 4
    };
  }

  function buildPreface(answers) {
    const genreInfo = GENRES.find(g => g.id === answers.genre);
    const genreDesc = genreInfo ? genreInfo.description : "Standard clean design.";
    
    let preface = `You are building "${answers.name || 'an application'}" — ${answers.description || 'A software project'}.

Technical Constraints:
- Architecture: ${answers.archetype}
- Frontend: ${answers.frontend}
- Backend: ${answers.backend}
- Database: ${answers.database}
- Hosting: ${answers.hosting}

Design Direction:
- Style: ${genreDesc}`;

    if (answers.mobileFirst) preface += `\n- MUST be Mobile-First design.`;
    if (answers.darkMode) preface += `\n- MUST implement Dark Mode capability.`;
    if (answers.productionQuality) preface += `\n- CRITICAL: Ensure production quality (strict accessibility, semantic HTML, scalable components, zero vibe-coding).`;

    return preface;
  }

  function assembleSpec(answers) {
    const inferred = inferDefaults(answers);
    const arch = inferred.archetype;
    const scaleIdx = SCALE_INDEX[inferred.scale] || 0;
    
    const blueprint = BLUEPRINTS[arch] || BLUEPRINTS["web-app"];
    const applicableStages = blueprint.filter(s => scaleIdx >= s.minScale);
    
    const preface = buildPreface(inferred);
    let raw = "";
    
    if (inferred.scale === "hobby") {
      let combinedContent = "";
      applicableStages.forEach(s => {
        combinedContent += "\n" + s.stage(inferred).trim() + "\n";
      });
      raw = `## Stage 1 — Complete Application Build\n\n${combinedContent.trim()}\n`;
    } else {
      applicableStages.forEach((s, i) => {
        raw += `## Stage ${i + 1} — ${s.title}\n\n`;
        raw += s.stage(inferred).trim();
        raw += `\n\n---\n\n`;
      });
    }

    return {
      raw: raw.trim(),
      preface: preface,
      strategy: "stage",
      stageCount: inferred.scale === "hobby" ? 1 : applicableStages.length,
      charCount: raw.length + preface.length
    };
  }

  const api = {
    SCALES,
    SCALE_INDEX,
    ARCHETYPES,
    GENRES,
    GENRE_DESCRIPTIONS: GENRES,
    FEATURE_SUGGESTIONS,
    DEFAULT_STACKS,
    assembleSpec,
    buildPreface,
    getVisibleSections,
    inferDefaults
  };

  global.AISQSpec = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

})(typeof globalThis !== "undefined" ? globalThis : this);
