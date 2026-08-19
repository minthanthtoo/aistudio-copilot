(function initAISQSpecData(global) {
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

  const BUILT_IN_TEMPLATES = [
    {
      id: "saas-dashboard",
      name: "SaaS Dashboard",
      icon: "📊",
      scale: "production",
      answers: {
        name: "SaaS Dashboard",
        description: "B2B SaaS application with multi-tenancy and billing.",
        archetype: "saas",
        scale: "production",
        features: "User authentication, team management, billing/subscriptions, interactive data dashboard with charts, CSV export.",
        featureChips: ["User Auth", "Team Management", "Dashboard", "Billing Integration"],
        genre: "dashboard",
        mobileFirst: true,
        darkMode: true,
        productionQuality: true,
        screens: ["Landing Page", "Login", "Dashboard", "Settings", "Billing", "Team Management"],
        frontend: "Next.js 14 App Router",
        backend: "Node.js + NestJS",
        database: "PostgreSQL (Supabase)",
        hosting: "Vercel",
        security: "OAuth, RBAC, Data encryption"
      }
    },
    {
      id: "portfolio",
      name: "Portfolio Site",
      icon: "📁",
      scale: "hobby",
      answers: {
        name: "Personal Portfolio",
        description: "Minimalist personal portfolio for a designer or developer.",
        archetype: "portfolio",
        scale: "hobby",
        features: "Project gallery with case studies, about me section, contact form, resume download.",
        featureChips: ["Project Gallery", "About Me", "Contact Form"],
        genre: "minimal",
        mobileFirst: true,
        darkMode: true,
        screens: ["Home", "Project Detail", "About", "Contact"],
        frontend: "Astro",
        backend: "None",
        database: "None",
        hosting: "GitHub Pages"
      }
    },
    {
      id: "mobile-social",
      name: "Mobile Social App",
      icon: "📱",
      scale: "startup",
      answers: {
        name: "Social Connect",
        description: "Mobile-first social networking app with media sharing.",
        archetype: "mobile-app",
        scale: "startup",
        features: "User profiles, photo/video uploads, news feed, infinite scroll, likes and comments, push notifications.",
        featureChips: ["Bottom Navigation", "Pull to Refresh", "Push Notifications"],
        genre: "playful",
        mobileFirst: true,
        darkMode: true,
        screens: ["Feed", "Discover", "Create Post", "Notifications", "Profile"],
        frontend: "React Native",
        backend: "Firebase",
        database: "Firestore",
        hosting: "App Stores",
        security: "Content moderation, secure media storage"
      }
    },
    {
      id: "e-commerce",
      name: "E-Commerce Store",
      icon: "🛒",
      scale: "mvp",
      answers: {
        name: "Modern Storefront",
        description: "Direct-to-consumer e-commerce storefront.",
        archetype: "e-commerce",
        scale: "mvp",
        features: "Product catalog with variants, shopping cart, Stripe checkout, order confirmation, basic customer accounts.",
        featureChips: ["Product Catalog", "Shopping Cart", "Checkout"],
        genre: "corporate",
        mobileFirst: true,
        screens: ["Home", "Category", "Product Detail", "Cart", "Checkout"],
        frontend: "Next.js 14 App Router",
        backend: "Next.js API Routes",
        database: "PostgreSQL",
        hosting: "Vercel"
      }
    },
    {
      id: "ai-chat",
      name: "AI Chat App",
      icon: "🤖",
      scale: "mvp",
      answers: {
        name: "AI Assistant",
        description: "Chatbot interface with streaming LLM responses and chat history.",
        archetype: "ai-ml-app",
        scale: "mvp",
        features: "Chat interface, streaming responses, chat history sidebar, prompt library, export to markdown.",
        featureChips: ["Prompt Input", "Chat History", "Streaming Responses"],
        genre: "hacker",
        darkMode: true,
        screens: ["Chat Interface", "History", "Settings"],
        frontend: "React",
        backend: "Python + FastAPI",
        database: "PostgreSQL (pgvector)",
        hosting: "Render"
      }
    },
    {
      id: "game-jam",
      name: "Game Jam Entry",
      icon: "🎮",
      scale: "hobby",
      answers: {
        name: "Web Game",
        description: "Browser-based 2D game with local high scores.",
        archetype: "game",
        scale: "hobby",
        features: "Main menu, core game loop, collision detection, particle effects, local storage high scores.",
        featureChips: ["Game Loop", "Score Tracking", "Sound Effects"],
        genre: "brutalist",
        screens: ["Main Menu", "Game View", "Game Over"],
        frontend: "Vanilla JS + Canvas API",
        backend: "None",
        database: "None",
        hosting: "Vercel"
      }
    },
    {
      id: "enterprise-admin",
      name: "Enterprise Admin",
      icon: "🏢",
      scale: "production",
      answers: {
        name: "Admin Portal",
        description: "Internal back-office tool for customer support and operations.",
        archetype: "enterprise",
        scale: "production",
        features: "SSO integration, comprehensive audit logging, complex data grids with export, user impersonation, role-based workflows.",
        featureChips: ["Single Sign-On (SSO)", "Audit Logs", "Complex Workflows"],
        genre: "production",
        productionQuality: true,
        screens: ["Login", "Dashboard", "User Management", "Audit Logs", "Reports"],
        frontend: "Angular",
        backend: "Java Spring Boot",
        database: "PostgreSQL",
        hosting: "AWS",
        security: "SSO (SAML/OIDC), strict RBAC, network isolation"
      }
    }
  ];

  const api = { SCALES, SCALE_INDEX, ARCHETYPES, GENRES, FEATURE_SUGGESTIONS, DEFAULT_STACKS, BUILT_IN_TEMPLATES };
  if (global.AISQSpec) { Object.assign(global.AISQSpec, api); } else { global.AISQSpecData = api; }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
