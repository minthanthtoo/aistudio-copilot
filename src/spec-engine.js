(function initAISQSpec(global) {
  "use strict";
  const Data = global.AISQSpecData || (typeof require !== "undefined" ? require("./spec-data.js") : {});
  const { SCALE_INDEX, ARCHETYPES, SCALES, GENRES, FEATURE_SUGGESTIONS, DEFAULT_STACKS, BUILT_IN_TEMPLATES } = Data;


  function formatScreens(screens) {
    if (!screens || !screens.length) return "1. Home (/)";
    if (Array.isArray(screens)) return screens.map((s, i) => `${i + 1}. ${s}`).join("\n");
    return "1. " + screens;
  }

  function stageFoundation(answers) {
    const screens = formatScreens(answers.screens);
    const nav = answers.flowDescription || "Standard desktop top bar and mobile hamburger/bottom navigation.";
    
    return `
Build the complete application shell with routing and navigation.

SCREENS TO SCAFFOLD (each must render meaningful placeholder content):
${screens}

NAVIGATION & LAYOUT:
- ${nav}
- Build all routes with a shared Layout component.
- Ensure proper routing configuration for all specified screens.
- Use realistic placeholder data (not lorem ipsum). Every page MUST render something meaningful.
`;
  }

  function stageDataModel(answers) {
    return `
Implement the database schema and core backend logic using ${answers.database} and ${answers.backend}.

TABLES / COLLECTIONS:
- users (id, email, display_name, role, created_at)
- Design and document the necessary schemas to support: ${answers.features || "Core application entities"}
- Ensure proper foreign key constraints and indexes.

DATA ACCESS & SECURITY:
- Implement data access patterns (ORMs, query builders, or raw SQL).
- Define access control rules (Row-Level Security or application-level authorization).
- Customers should only read/write their own data; Admins have full access.

SEED DATA: 
- Create robust seed scripts with realistic, domain-specific mock data. Do NOT use "lorem ipsum".
- Include at least 3 distinct entities and 10+ records per entity to properly test UI states.

Create API clients or typed query hooks for the frontend to consume these services.
`;
  }

  function stageCoreFeatures(answers) {
    const featureText = answers.features || "Implement the primary application functionality.";
    const uniqueChips = (answers.featureChips || []).filter(c => !featureText.toLowerCase().includes(c.toLowerCase()));
    const chips = uniqueChips.length ? "\nAdditional Modules: " + uniqueChips.join(", ") : "";
    const screenList = answers.screens && answers.screens.length ? "\n\nSCREENS IN SCOPE:\n" + (Array.isArray(answers.screens) ? answers.screens.map((s,i) => (i+1)+". "+s).join("\n") : answers.screens) : "";
    
    return `
Implement the complete end-to-end user workflows for the core features.

FEATURES:
${featureText}${chips}${screenList}

IMPLEMENTATION DETAILS:
- Each workflow MUST include its relevant UI components and connect to the backend services.
- Implement comprehensive input validation (client-side and server-side).
- Every interaction needs: loading spinner during async work, error toast on failure, empty state with helpful message and CTA.
- Ensure state is managed properly across the application.
- All forms MUST have clear success and error feedback.
- Use optimistic UI updates where appropriate to ensure a snappy user experience.
`;
  }

  function stagePolish(answers) {
    const sections = [
      `1. RESPONSIVE AUDIT:\n   - Test and fix every page at 375px (mobile), 768px (tablet), and 1280px (desktop).\n   - Mobile: Ensure all tap targets are >= 44px, no horizontal scroll, bottom nav functional.\n   - Tablet/Desktop: Ensure grids and flex layouts utilize available space optimally.`
    ];
    if (answers.productionQuality) {
      sections.push(`2. ACCESSIBILITY:\n   - All interactive elements keyboard-navigable with visible focus rings.\n   - ARIA labels on icon-only buttons.\n   - Color contrast ratio >= 4.5:1 on all text.\n   - Screen reader announcements for state changes.`);
    }
    sections.push(`${sections.length + 1}. LOADING & ERROR STATES:\n   - Skeleton loaders for data-heavy components.\n   - Error boundaries with "Something went wrong" + retry button at the page level.\n   - Global toast notification system (success/error/info).`);
    sections.push(`${sections.length + 1}. PERFORMANCE & SEO:\n   - Lazy load images below the fold.\n   - Debounce rapid inputs (like search).\n   - Dynamic page titles and meta descriptions.`);
    return `\nApply polish and prepare the application for a high-quality user experience.\n\n${sections.join('\n\n')}\n`;
  }

  function stageSecurity(answers) {
    return `
Implement security hardening and production-grade auth.

CORE REQUIREMENTS:
- Implement authentication strategy: ${answers.authType || "OAuth + Email/Password"}.
- Set up Role-Based Access Control (RBAC) across the frontend and backend.
- Secure all API endpoints against unauthorized access.
${answers.security ? "\nSPECIFIC NEEDS:\n- " + answers.security : ""}

HARDENING:
- Implement robust CSRF and XSS protection.
- Setup proper rate limiting on the backend API.
- Ensure all sensitive data is properly hashed and encrypted in transit and at rest.
- Implement secure session management.
`;
  }

  function stageTesting(answers) {
    return `
Establish the testing strategy and implement the core test suite.

REQUIREMENTS:
1. Setup testing frameworks for unit and E2E testing (e.g., Jest, Playwright/Cypress).
2. Write unit tests for critical business logic, utility functions, and complex components.
3. Write integration tests for critical API endpoints.
4. Write E2E tests for the primary user workflows (e.g., authentication, checkout, data mutation).

Aim for high test coverage on the critical path. Setup mock data and isolated test environments.
`;
  }

  function stageDeployment(answers) {
    return `
Configure deployment, CI/CD, and monitoring.

REQUIREMENTS:
1. Prepare the application for deployment to ${answers.hosting}.
2. Provide Dockerfiles or infrastructure-as-code configurations if applicable.
3. Setup a CI/CD pipeline configuration (e.g., GitHub Actions) to lint, test, and deploy automatically.
4. Configure environment variables and secrets management.
5. Setup basic monitoring and error logging integration.
`;
  }
  
  // Custom stage for Portfolio
  function stagePortfolioBuild(answers) {
    const screens = formatScreens(answers.screens);
    return `Build a complete, polished personal portfolio.

SCREENS TO SCAFFOLD:
${screens}

NAVIGATION: Fixed top bar. Mobile: hamburger -> slide-out menu. Active page indicator.
FOOTER: Centered copyright, social icon row.

DATA: Create realistic portfolio projects with actual descriptions (not lorem ipsum). Include some that have case study depth. Each project needs a distinct cover image placeholder.

Make it feel finished and deployable. Every page must render meaningful content.`;
  }

  // E-commerce specific
  function stageShoppingFlow(answers) {
    return `
Implement the complete end-to-end shopping experience.

1. PRODUCT LISTING
   - Category filter sidebar with checkboxes and item counts
   - Price range slider (min/max with debounced URL query params)
   - Sort dropdown: Price ↑, Price ↓, Newest, Best Rated
   - Paginated grid with skeleton loading placeholders

2. PRODUCT DETAIL
   - Image gallery: main image + thumbnail strip, click to switch
   - Variant/size selector if applicable
   - "Add to Cart" with quantity picker and animated cart badge feedback
   - "♡ Wishlist" toggle with optimistic UI
   - Reviews section: star distribution bar, paginated list, "Write a Review" form

3. CART
   - Persistent: logged-in uses DB, guests use localStorage (merge on login)
   - Quantity +/- with max=inventory validation
   - "Remove" with 5-second undo toast
   - Live subtotal + estimated tax + shipping calculation

4. CHECKOUT (multi-step with progress indicator)
   - Step 1 Shipping: address form with validation, or select saved address
   - Step 2 Payment: Stripe Elements card input (test mode), order summary sidebar
   - Step 3 Confirmation: success animation, order number, "Continue Shopping" CTA
   - Cannot advance without completing validation

Every interaction MUST have: loading spinner, error toast, empty state with CTA.
`;
  }
  
  

  function stageGameLoop(answers) {
    return `
Core Game Loop with requestAnimationFrame/fixed timestep.
Input handling (keyboard, mouse/touch, gamepad).
Game state machine: MENU -> PLAYING -> PAUSED -> GAME_OVER.
Collision detection system.
Score tracking with localStorage high-score persistence.
Particle/effect system for visual feedback.
Sound manager (Web Audio API) for SFX and background music.
Progressive difficulty scaling.
`;
  }

  function stageAPIDesign(answers) {
    return `
RESTful or GraphQL API design with versioned endpoints.
OpenAPI/Swagger auto-generated documentation.
Request validation middleware (Zod/Joi schemas).
Rate limiting (token bucket, per-key quotas).
API key generation, rotation, and revocation.
Webhook delivery system with retry and signature verification.
Health check and readiness probe endpoints.
Structured JSON error responses with error codes.
`;
  }

  function stageAgentOrchestration(answers) {
    return `
Agent definition schema (name, system prompt, tools, model).
Tool registry with typed input/output schemas.
Task orchestration: sequential, parallel, and conditional routing.
Shared memory store (short-term context + long-term vector DB).
Human-in-the-loop approval gates.
Execution trace logging with token/cost tracking.
Graceful error handling: retry, fallback agent, escalate to human.
`;
  }

  function stageDashboardWidgets(answers) {
    return `
KPI summary cards (value, trend arrow, sparkline).
Interactive charts: line, bar, pie, heatmap (use a charting library).
Data grid with server-side sort, filter, pagination, CSV export.
Date range picker filtering all widgets simultaneously.
Customizable layout: drag-to-reorder widget grid.
Real-time update mechanism (polling or WebSocket).
Dark mode toggle that persists across sessions.
`;
  }

  function stageAIIntegration(answers) {
    return `
LLM integration with streaming token-by-token responses.
Chat interface: message list, input bar, "Stop" button during streaming.
Conversation history sidebar with search and delete.
System prompt configuration panel.
File/image upload for multimodal input.
Response export to Markdown/PDF.
Token usage display and cost estimation per conversation.
Feedback mechanism (thumbs up/down) per response.
`;
  }

  function stageMobilePatterns(answers) {
    return `
Bottom tab navigation with badge indicators.
Pull-to-refresh on all list screens.
Swipe-to-dismiss / swipe-to-reveal-actions on list items.
Push notification registration and deep linking.
Offline-first with local cache and sync-on-reconnect.
Biometric authentication (FaceID/Fingerprint) for sensitive actions.
Haptic feedback on key interactions.
Adaptive layouts for phone vs tablet.
`;
  }

  // ----- Stage Resolution Pipeline -----


  function stageADR(answers) {
    return `
Produce Architecture Decision Records (ADRs) for this project.

REQUIREMENTS:
1. Identify 3-5 critical technical decisions (e.g., state management, database selection, auth strategy).
2. For each, output a formal ADR including:
   - Context and Problem Statement
   - Considered Options
   - Decision Outcome
   - Consequences (Positive and Negative)
`;
  }

  function stageThreatModel(answers) {
    return `
Perform a Threat Model analysis and establish security policies.

REQUIREMENTS:
1. Use STRIDE methodology (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege).
2. Identify primary threat actors and attack vectors for this specific architecture.
3. Define mitigation strategies for the top 5 identified risks.
4. Output a summary Threat Model document.
`;
  }
  function resolveStages(answers) {
    const scale = answers.scale || "hobby";
    const scaleIdx = SCALE_INDEX[scale] || 0;
    const arch = answers.archetype || "web-app";
    
    let pipeline = [];
    
    if (scaleIdx === 0 && arch === "portfolio") {
      pipeline.push({ id: "foundation", title: "Complete Portfolio Build", enabled: true, required: true, category: "foundation", builder: stagePortfolioBuild });
      return pipeline;
    }
    
    if (scaleIdx === 0) {
      pipeline.push({ id: "foundation", title: "Complete Application Build", enabled: true, required: true, category: "foundation", builder: a => stageFoundation(a) + "\n\n" + stageCoreFeatures(a) });
      return pipeline;
    }

    // Standard multi-stage pipeline
    pipeline.push({ id: "foundation", title: "Foundation & Navigation Shell", enabled: true, required: true, category: "foundation", builder: stageFoundation });
    
    if (answers.backend && answers.backend !== "None" && answers.database && answers.database !== "None") {
      pipeline.push({ id: "data-model", title: "Data Model & Backend", enabled: true, required: false, category: "data", builder: stageDataModel });
    }
    
    const featureBuilders = {
      "e-commerce": { id: "shopping-flow", title: "Shopping Flow & Checkout", builder: stageShoppingFlow },
      "game":       { id: "game-loop", title: "Game Loop & Mechanics", builder: stageGameLoop },
      "api-service":{ id: "api-design", title: "API Design & Documentation", builder: stageAPIDesign },
      "agent-swarm":{ id: "orchestration", title: "Agent Orchestration & Tools", builder: stageAgentOrchestration },
      "dashboard":  { id: "widgets", title: "Dashboard Widgets & Data Viz", builder: stageDashboardWidgets },
      "ai-ml-app":  { id: "ai-integration", title: "AI/LLM Integration & Chat", builder: stageAIIntegration },
      "mobile-app": { id: "mobile-patterns", title: "Mobile UX Patterns", builder: stageMobilePatterns },
    };

    const custom = featureBuilders[arch];
    if (custom) {
      pipeline.push({ id: custom.id, title: custom.title, enabled: true, required: false, category: "features", builder: custom.builder });
    } else {
      pipeline.push({ id: "features", title: "Core Features & Workflows", enabled: true, required: false, category: "features", builder: stageCoreFeatures });
    }
    
    pipeline.push({ id: "polish", title: "Polish & Production Readiness", enabled: true, required: false, category: "design", builder: stagePolish });

    if (scaleIdx >= 3) {
      pipeline.push({ id: "security", title: "Security Hardening", enabled: true, required: false, category: "security", builder: stageSecurity });
      pipeline.push({ id: "testing", title: "Testing Strategy", enabled: true, required: false, category: "testing", builder: stageTesting });
    }
    
    if (scaleIdx >= 2) {
      pipeline.push({ id: "deployment", title: "Deployment & CI/CD", enabled: true, required: false, category: "deployment", builder: stageDeployment });
    }

    if (scaleIdx >= 4) {
      pipeline.push({ id: "adr", title: "Architecture Decision Records (ADR)", enabled: true, required: false, category: "enterprise", builder: stageADR });
      pipeline.push({ id: "threat-model", title: "Threat Modeling (STRIDE)", enabled: true, required: false, category: "enterprise", builder: stageThreatModel });
    }
    return pipeline;
  }

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
      else if (scale === "enterprise" || scale === "production" || inferred.productionQuality) inferred.genre = "production";
      else inferred.genre = "minimal";
    }

    if (!inferred.authType) {
      if (scaleIdx === 0) inferred.authType = "None";
      else if (scaleIdx <= 2) inferred.authType = "Email & Password";
      else inferred.authType = "OAuth + Email & Password";
    }
    
    if (!inferred.screens || inferred.screens.length === 0) {
       if (arch === "e-commerce") inferred.screens = ["Home", "Product Listing", "Product Detail", "Cart", "Checkout", "User Dashboard", "Vendor Portal"];
       else if (arch === "saas") inferred.screens = ["Landing Page", "Login/Signup", "Dashboard", "Settings", "Billing"];
       else if (arch === "portfolio") inferred.screens = ["Home", "Project Detail", "About", "Contact"];
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
    const genreInfo = GENRES[answers.genre];
    const genreDesc = genreInfo ? genreInfo.description : "Standard clean design.";
    

    let preface = `You are building "${answers.name || 'an application'}" — ${answers.description || 'A software project'}.\n\n`;
    
    if (answers.industry) {
      preface += `Industry Context: ${answers.industry}\n`;
      if (/healthcare|medical/i.test(answers.industry)) preface += `- Strict HIPAA compliance required for all PII/PHI data.\n`;
      if (/finance|banking|fintech/i.test(answers.industry)) preface += `- Strict PCI-DSS compliance and financial data rounding rules apply.\n`;
      if (/education|school/i.test(answers.industry)) preface += `- FERPA compliance and accessibility (WCAG 2.1 AA) are mandatory.\n`;
      preface += `\n`;
    }

    
    preface += `Technical Constraints:\n`;
    preface += `- Architecture: ${ARCHETYPES[answers.archetype]?.label || answers.archetype}\n`;
    preface += `- Frontend: ${answers.frontend}\n`;
    if (answers.backend && answers.backend !== "None") preface += `- Backend: ${answers.backend}\n`;
    if (answers.database && answers.database !== "None") preface += `- Database: ${answers.database}\n`;
    preface += `- Hosting: ${answers.hosting}\n`;
    if (answers.mobileFirst) preface += `- Responsive: Mobile-first design\n`;
    
    preface += `\nDesign Direction:\n`;
    preface += `- Style: ${genreInfo?.label || answers.genre} — ${genreDesc}\n`;
    if (answers.darkMode) preface += `- Theme: Must support Dark Mode capability\n`;
    if (answers.productionQuality) preface += `- Quality: Production-grade (strict accessibility, semantic HTML, scalable components, zero vibe-coding)\n`;

    return preface;
  }

  function assembleSpec(answers, stageOverrides = {}) {
    const inferred = inferDefaults(answers);
    const stages = resolveStages(inferred);
    const preface = buildPreface(inferred);
    
    const enabledStages = stages.filter(s => 
      stageOverrides[s.id] !== undefined ? stageOverrides[s.id] : s.enabled
    );
    
    const raw = enabledStages.map((s, i) => 
      `## Stage ${i + 1} — ${s.title}\n\n${s.builder(inferred).trim()}`
    ).join("\n\n\n");

    return { 
      raw, 
      preface, 
      strategy: "stage", 
      stageCount: enabledStages.length,
      charCount: raw.length + preface.length,
      stages: enabledStages
    };
  }


  // ----- Templates -----
  function serializeTemplate(answers) {
    const clean = {};
    for (const key in answers) {
      if (answers[key] !== undefined && answers[key] !== "") {
        clean[key] = answers[key];
      }
    }
    return JSON.stringify(clean, null, 2);
  }

  const VALID_TEMPLATE_KEYS = new Set([
    "name", "description", "archetype", "scale", "features", "featureChips",
    "genre", "mobileFirst", "darkMode", "productionQuality", "screens",
    "frontend", "backend", "database", "hosting", "security", "industry",
    "authType", "flowDescription", "stageOverrides"
  ]);

  function deserializeTemplate(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (typeof parsed !== "object" || !parsed || Array.isArray(parsed)) return null;
      const clean = {};
      for (const key of Object.keys(parsed)) {
        if (VALID_TEMPLATE_KEYS.has(key)) clean[key] = parsed[key];
      }
      return Object.keys(clean).length > 0 ? clean : null;
    } catch (e) {
      return null;
    }
  }

  const api = {
    SCALES,
    SCALE_INDEX,
    ARCHETYPES,
    GENRES,
    GENRE_DESCRIPTIONS: GENRES,
    FEATURE_SUGGESTIONS,
    DEFAULT_STACKS,
    resolveStages,
    assembleSpec,
    buildPreface,
    getVisibleSections,
    inferDefaults,
    BUILT_IN_TEMPLATES,
    serializeTemplate,
    deserializeTemplate
  };

  global.AISQSpec = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

})(typeof globalThis !== "undefined" ? globalThis : this);
