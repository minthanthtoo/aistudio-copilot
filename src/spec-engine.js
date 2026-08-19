(function initAISQSpec(global) {
  "use strict";

  const SCALES = ["hobby", "mvp", "startup", "production", "enterprise"];
  const SCALE_INDEX = { hobby: 0, mvp: 1, startup: 2, production: 3, enterprise: 4 };

  const ARCHETYPES = {
    "web-app": { label: "Web App", emoji: "🌐" },
    "e-commerce": { label: "E-Commerce", emoji: "🛒" },
    "saas": { label: "SaaS Platform", emoji: "📊" },
    "ai-ml-app": { label: "AI / ML App", emoji: "🤖" },
    "portfolio": { label: "Portfolio", emoji: "📁" },
    "dashboard": { label: "Dashboard", emoji: "📋" },
    "mobile-app": { label: "Mobile App", emoji: "📱" },
    "game": { label: "Game", emoji: "🎮" },
    "3d-cad": { label: "3D / CAD", emoji: "🏗️" },
    "cloud-app": { label: "Cloud App", emoji: "☁️" },
    "enterprise": { label: "Enterprise", emoji: "🏢" },
    "api-service": { label: "API Service", emoji: "⚡" },
    "agent-swarm": { label: "Agent Swarm", emoji: "🐝" }
  };

  const GENRES = {
    "minimal": { label: "Minimal", description: "Minimalist, clean, lots of whitespace. Focus on typography and crisp layouts. Use a very constrained monochrome palette with perhaps one accent color." },
    "corporate": { label: "Corporate", description: "Professional, trustworthy, enterprise-grade. Use traditional layouts with solid navigation. Blue or neutral branding, clear CTA buttons, high-contrast text." },
    "playful": { label: "Playful", description: "Vibrant colors, rounded corners, bubbly typography, subtle micro-interactions, friendly copywriting, engaging and fun." },
    "editorial": { label: "Editorial", description: "Magazine-style layout, large serif typography mixed with clean sans-serif body text. Asymmetrical grids, large high-quality imagery, refined aesthetic." },
    "dashboard": { label: "Dashboard", description: "Data-dense but clear. Card-based layouts, robust sidebar navigation. Use subtle borders, light grays for grouping, and distinct categorical colors for charts and status badges." },
    "glassmorphism": { label: "Glassmorphism", description: "Translucent frosted-glass effects on cards and modals, colorful blurred gradient backgrounds, thin semi-transparent borders, floating UI elements." },
    "brutalist": { label: "Brutalist", description: "Raw, harsh, utilitarian. High-contrast colors (often black/white + neon), thick borders, monospaced or huge bold typography, visible grid lines." },
    "hacker": { label: "Hacker / Cyberpunk", description: "Dark mode native, neon green or magenta accents, monospaced terminal fonts, glowing effects, grid/matrix backgrounds, tech-focused aesthetic." },
    "production": { label: "Production (No Vibe-Coding)", description: "Focus exclusively on functional excellence, semantic HTML, comprehensive accessibility (WAI-ARIA), proper focus states, and scalable component architecture over stylistic flourishes." }
  };

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
    "e-commerce": { frontend: "Next.js 14 App Router", backend: "Next.js API Routes", database: "PostgreSQL (Supabase)", hosting: "Vercel" },
    "saas": { frontend: "Next.js", backend: "Node.js + NestJS", database: "PostgreSQL", hosting: "AWS" },
    "ai-ml-app": { frontend: "React", backend: "Python + FastAPI", database: "PostgreSQL (pgvector)", hosting: "Render" },
    "portfolio": { frontend: "Astro", backend: "None", database: "None", hosting: "GitHub Pages" },
    "dashboard": { frontend: "Vue.js", backend: "Node.js + Express", database: "MySQL", hosting: "Vercel" },
    "mobile-app": { frontend: "React Native", backend: "Firebase", database: "Firestore", hosting: "App Stores" },
    "game": { frontend: "Vanilla JS + Canvas API", backend: "Node.js", database: "Redis", hosting: "Vercel" },
    "3d-cad": { frontend: "React + Three.js", backend: "Python", database: "PostgreSQL", hosting: "Vercel" },
    "cloud-app": { frontend: "React", backend: "Go", database: "PostgreSQL", hosting: "AWS" },
    "enterprise": { frontend: "Angular", backend: "Java Spring Boot", database: "PostgreSQL", hosting: "AWS" },
    "api-service": { frontend: "None", backend: "Go / Node.js", database: "PostgreSQL", hosting: "AWS" },
    "agent-swarm": { frontend: "React", backend: "Python + LangChain", database: "PostgreSQL", hosting: "AWS" }
  };

  // ----- High-Quality Stage Builders -----

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
    const chips = answers.featureChips && answers.featureChips.length ? "\nKey Modules: " + answers.featureChips.join(", ") : "";
    return `
Implement the complete end-to-end user workflows for the core features.

FEATURES:
${featureText}${chips}

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
    const prodStr = answers.productionQuality ? 
      "\n2. ACCESSIBILITY:\n   - All interactive elements keyboard-navigable with visible focus rings.\n   - ARIA labels on icon-only buttons.\n   - Color contrast ratio >= 4.5:1 on all text.\n   - Screen reader announcements for state changes." : "";
    
    return `
Apply polish and prepare the application for a high-quality user experience.

1. RESPONSIVE AUDIT:
   - Test and fix every page at 375px (mobile), 768px (tablet), and 1280px (desktop).
   - Mobile: Ensure all tap targets are >= 44px, no horizontal scroll, bottom nav functional.
   - Tablet/Desktop: Ensure grids and flex layouts utilize available space optimally.${prodStr}

3. LOADING & ERROR STATES:
   - Skeleton loaders for data-heavy components.
   - Error boundaries with "Something went wrong" + retry button at the page level.
   - Global toast notification system (success/error/info).

4. PERFORMANCE & SEO:
   - Lazy load images below the fold.
   - Debounce rapid inputs (like search).
   - Dynamic page titles and meta descriptions.
`;
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
  function stageShoppingFlow(answers) { return `Implement the complete shopping flow:\n\n1. PRODUCT LISTING: Category filter, price range slider, sort dropdown, pagination, skeleton loading grid.\n2. PRODUCT DETAIL: Image gallery, variant selector, Add to Cart with quantity picker, Wishlist toggle, Reviews section.\n3. CART: Persistent cart, quantity controls, real-time subtotal/tax calculation.\n4. CHECKOUT: Multi-step (Shipping -> Payment -> Confirmation). Form validation before advancing.\n\nEvery interaction MUST have loading states, error handling, and optimistic UI updates.`; }
  
  // ----- Stage Resolution Pipeline -----

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
    pipeline.push({ id: "data-model", title: "Data Model & Backend", enabled: true, required: false, category: "data", builder: stageDataModel });
    
    if (arch === "e-commerce") {
      pipeline.push({ id: "shopping-flow", title: "Shopping Flow & Checkout", enabled: true, required: false, category: "features", builder: stageShoppingFlow });
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
    ).join("\n\n---\n\n");

    return { 
      raw, 
      preface, 
      strategy: "stage", 
      stageCount: enabledStages.length,
      charCount: raw.length + preface.length,
      stages: enabledStages
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
    resolveStages,
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
