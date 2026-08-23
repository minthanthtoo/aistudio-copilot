const test = require("node:test");
const assert = require("node:assert/strict");
require("../src/core-constants.js");
require("../src/core-utils.js");
require("../src/core-state.js");
require("../src/core-selectors.js");
require("../src/core-commands.js");
const Core = global.AISQCore;
Object.assign(Core, require("../src/core-parser.js"));
const AISQSpec = require("../src/spec-engine.js");

test("Spec Engine API available", () => {
  assert.ok(AISQSpec);
  assert.ok(AISQSpec.ARCHETYPES);
  assert.ok(AISQSpec.SCALES);
  assert.ok(AISQSpec.assembleSpec);
  assert.ok(AISQSpec.resolveStages);
});

test("inferDefaults - fills missing data intelligently", () => {
  const result = AISQSpec.inferDefaults({
    archetype: "e-commerce",
    scale: "mvp"
  });

  assert.equal(result.frontend, "Next.js 14 App Router");
  assert.equal(result.backend, "Next.js API Routes");
  assert.equal(result.database, "PostgreSQL (Supabase)");
  assert.equal(result.authType, "Email & Password"); // scale=mvp -> Email & Password
});

test("buildPreface - generates shared context", () => {
  const preface = AISQSpec.buildPreface({
    name: "ShopifyClone",
    description: "A cool store",
    archetype: "e-commerce",
    frontend: "React",
    backend: "Node",
    database: "Postgres",
    hosting: "Vercel",
    genre: "minimal",
    mobileFirst: true,
    productionQuality: true
  });

  assert.match(preface, /ShopifyClone/);
  assert.match(preface, /A cool store/);
  assert.match(preface, /React/);
  assert.match(preface, /Minimalist/);
  assert.match(preface, /Mobile-first/);
  assert.match(preface, /Production-grade/);
});

test("assembleSpec - Hobby Scale Portfolio (Combined prompt)", () => {
  const result = AISQSpec.assembleSpec({
    name: "MyBlog",
    archetype: "portfolio",
    scale: "hobby",
    features: "Show my posts"
  });

  assert.equal(result.strategy, "stage");
  assert.equal(result.stageCount, 1);
  assert.match(result.raw, /## Stage 1 — Complete Portfolio Build/);
  assert.ok(result.preface.length > 0);
});

test("assembleSpec - Production Scale E-commerce", () => {
  const result = AISQSpec.assembleSpec({
    name: "EnterpriseApp",
    archetype: "e-commerce",
    scale: "production",
    features: "Lots of stuff"
  });

  assert.equal(result.strategy, "stage");
  assert.ok(result.stageCount >= 4);
  assert.match(result.raw, /## Stage 1 — /);
  assert.match(result.raw, /## Stage 2 — /);
  // Production scale has security and testing
  assert.match(result.raw, /Security Hardening/);
  assert.match(result.raw, /Testing Strategy/);
});

test("assembleSpec output splits correctly via parsePromptPack", () => {
  const result = AISQSpec.assembleSpec({
    name: "SplitApp",
    archetype: "saas",
    scale: "mvp",
    features: "Some saas features"
  });
  
  // The integration test!
  console.log("Core keys: ", Object.keys(Core));
  const parsed = Core.parsePromptPack(result.raw, "stage");
  assert.equal(parsed.prompts.length, result.stageCount);
});

test("resolveStages - returns correct stage count per scale", () => {
  const hobby = AISQSpec.resolveStages({ scale: "hobby", archetype: "web-app" });
  assert.equal(hobby.length, 1); // Combined foundation + features
  
  const mvp = AISQSpec.resolveStages({ scale: "mvp", archetype: "web-app" });
  assert.ok(mvp.length >= 3); // Foundation, Data, Features, Polish
  
  const prod = AISQSpec.resolveStages({ scale: "production", archetype: "web-app" });
  assert.ok(prod.length >= 5); // + Security, Testing, Deployment
});

test("resolveStages - stage overrides exclude stages", () => {
  const overrides = { "testing": false, "polish": false };
  const result = AISQSpec.assembleSpec({ scale: "production", archetype: "web-app" }, overrides);
  
  assert.ok(result.stageCount < 6);
  assert.doesNotMatch(result.raw, /Testing Strategy/);
  assert.doesNotMatch(result.raw, /Polish & Production/);
});

test("getVisibleSections - conditional visibility backward compat", () => {
  const hobby = AISQSpec.getVisibleSections({ scale: "hobby" });
  assert.equal(hobby.features, true);
  assert.equal(hobby.techStack, false);
  assert.equal(hobby.security, false);

  const prod = AISQSpec.getVisibleSections({ scale: "production" });
  assert.equal(prod.techStack, true);
  assert.equal(prod.industry, true);
  assert.equal(prod.security, true);
  assert.equal(prod.advanced, false);
});

test("Empty answers don't crash and use defaults", () => {
  const result = AISQSpec.assembleSpec({});
  assert.ok(result.raw.length > 0);
  assert.equal(result.stageCount, 1); // default is hobby web-app
});

test("ARCHETYPES is a keyed object", () => {
  const keys = Object.keys(AISQSpec.ARCHETYPES);
  assert.ok(keys.includes("web-app"));
  assert.ok(keys.includes("e-commerce"));
  assert.equal(keys.includes("0"), false);
});

test("All 13 archetypes produce valid specs without crashing", () => {
  const keys = Object.keys(AISQSpec.ARCHETYPES);
  for (const arch of keys) {
    const result = AISQSpec.assembleSpec({ archetype: arch, scale: "mvp" });
    assert.ok(result.raw.length > 100);
    assert.ok(result.stageCount >= 2);
  }
});

test("All 9 genres produce non-empty design blocks", () => {
  const keys = Object.keys(AISQSpec.GENRES);
  for (const genre of keys) {
    const preface = AISQSpec.buildPreface({ genre });
    assert.ok(preface.includes(AISQSpec.GENRES[genre].label));
  }
});

test("Prompt quality: RFC-2119 language in production", () => {
  const result = AISQSpec.assembleSpec({ scale: "production" });
  assert.ok(/MUST|SHALL|REQUIRE|must|shall/i.test(result.raw));
});

test("Phase 2: Built-in templates exist", () => {
  assert.ok(AISQSpec.BUILT_IN_TEMPLATES.length >= 7);
  assert.equal(AISQSpec.BUILT_IN_TEMPLATES[0].id, "saas-dashboard");
});

test("Phase 2: serialize/deserialize templates", () => {
  const answers = { name: "Test", empty: "", undef: undefined };
  const json = AISQSpec.serializeTemplate(answers);
  assert.ok(!json.includes("empty"));
  assert.ok(!json.includes("undef"));
  assert.ok(json.includes("Test"));
  
  const parsed = AISQSpec.deserializeTemplate(json);
  assert.equal(parsed.name, "Test");
});

test("Phase 3: Enterprise stages ADR and Threat Model", () => {
  const prod = AISQSpec.resolveStages({ scale: "production", archetype: "web-app" });
  assert.ok(!prod.find(s => s.id === "adr"));

  const ent = AISQSpec.resolveStages({ scale: "enterprise", archetype: "web-app" });
  assert.ok(ent.find(s => s.id === "adr"));
  assert.ok(ent.find(s => s.id === "threat-model"));
});

test("Phase 3: Industry hints in preface", () => {
  const preface = AISQSpec.buildPreface({ industry: "Healthcare app" });
  assert.match(preface, /HIPAA compliance/);
});

test("stagePolish numbering is sequential", () => {
  const S = AISQSpec;
  const noProd = S.assembleSpec({scale: "mvp", archetype: "web-app"}, {polish: true});
  const polishNoProd = noProd.raw.split('---').find(s => s.includes('Apply polish'));
  assert.match(polishNoProd, /1\. RESPONSIVE AUDIT/);
  assert.match(polishNoProd, /2\. LOADING & ERROR STATES/);
  assert.match(polishNoProd, /3\. PERFORMANCE & SEO/);
  assert.doesNotMatch(polishNoProd, /4\./);

  const prod = S.assembleSpec({scale: "production", archetype: "web-app", productionQuality: true}, {polish: true});
  const polishProd = prod.raw.split('---').find(s => s.includes('Apply polish'));
  assert.match(polishProd, /1\. RESPONSIVE AUDIT/);
  assert.match(polishProd, /2\. ACCESSIBILITY/);
  assert.match(polishProd, /3\. LOADING & ERROR STATES/);
  assert.match(polishProd, /4\. PERFORMANCE & SEO/);
});

test("Game archetype gets stageGameLoop", () => {
  const stages = AISQSpec.resolveStages({archetype: "game", scale: "mvp"});
  assert.ok(stages.find(s => s.id === "game-loop"));
  assert.ok(!stages.find(s => s.id === "features"));
});

test("API archetype gets stageAPIDesign", () => {
  const stages = AISQSpec.resolveStages({archetype: "api-service", scale: "mvp"});
  assert.ok(stages.find(s => s.id === "api-design"));
  assert.ok(!stages.find(s => s.id === "features"));
});

test("Agent Swarm gets stageAgentOrchestration", () => {
  const stages = AISQSpec.resolveStages({archetype: "agent-swarm", scale: "mvp"});
  assert.ok(stages.find(s => s.id === "orchestration"));
});

test("Backend=None skips Data Model", () => {
  const stages = AISQSpec.resolveStages({archetype: "portfolio", scale: "mvp", backend: "None", database: "None"});
  assert.ok(!stages.find(s => s.id === "data-model"));
});

test("Feature chips deduplicated with textarea", () => {
  const result = AISQSpec.assembleSpec({
    archetype: "web-app", 
    scale: "mvp", 
    features: "Implement User Auth and Search", 
    featureChips: ["User Auth", "Notifications"]
  });
  const feats = result.raw.split('---').find(s => s.includes('Core Features'));
  assert.match(feats, /Additional Modules: Notifications/);
  assert.doesNotMatch(feats, /Additional Modules:.*User Auth/);
});

test("Industry field produces HIPAA hint", () => {
  const preface = AISQSpec.buildPreface({ industry: "Healthcare app" });
  assert.match(preface, /HIPAA compliance/);
});

test("Audience is visible, preserved in templates, and affects the generated preface", () => {
  assert.equal(AISQSpec.getVisibleSections({ scale: "hobby" }).audience, true);
  const preface = AISQSpec.buildPreface({ name: "Reader", description: "Track books", audience: "Students" });
  assert.match(preface, /Primary Audience: Students/);
  const encoded = AISQSpec.serializeTemplate({ name: "Reader", audience: "Students" });
  assert.deepEqual(AISQSpec.deserializeTemplate(encoded), { name: "Reader", audience: "Students" });
});

test("custom app categories retain their detail while using a reviewable generic generator profile", () => {
  const answers = { archetype: "custom", archetypeDetail: "Two-sided local-services marketplace", scale: "mvp" };
  const profile = AISQSpec.normalizeProjectProfile(answers);
  assert.deepEqual(profile, {
    archetype: "web-app",
    scale: "mvp",
    archetypeDetail: "Two-sided local-services marketplace",
    scaleDetail: "",
    isCustomArchetype: true,
    isCustomScale: false,
    requiresArchetypeReview: true,
    requiresScaleConfirmation: false,
    requiresReview: true,
    warnings: ["Custom app category uses the generic Web App workflow until reviewed."]
  });
  const result = AISQSpec.assembleSpec(answers);
  assert.match(result.preface, /Custom Product Category: Two-sided local-services marketplace/);
  assert.match(result.preface, /generic Web App workflow/);
  assert.ok(AISQSpec.resolveStages(answers).some((stage) => stage.id === "features"));
});

test("unknown legacy scale fails closed to a production profile until delivery profile confirmation", () => {
  const answers = { archetype: "web-app", scale: "mid-market pilot" };
  const profile = AISQSpec.normalizeProjectProfile(answers);
  assert.equal(profile.scale, "production");
  assert.equal(profile.scaleDetail, "mid-market pilot");
  assert.equal(profile.requiresScaleConfirmation, true);
  const stages = AISQSpec.resolveStages(answers).map((stage) => stage.id);
  assert.ok(stages.includes("security"));
  assert.ok(stages.includes("testing"));
  assert.ok(stages.includes("deployment"));
  const preface = AISQSpec.buildPreface(answers);
  assert.match(preface, /Custom Project Size: mid-market pilot/);
  assert.match(preface, /Production hardening, testing, and deployment/);
});

test("custom scale respects a confirmed delivery profile and round-trips custom fields through templates", () => {
  const answers = {
    archetype: "custom",
    archetypeDetail: "Interactive learning lab",
    scale: "custom",
    scaleDetail: "Single-school pilot",
    deliveryProfile: "mvp"
  };
  const profile = AISQSpec.normalizeProjectProfile(answers);
  assert.equal(profile.scale, "mvp");
  assert.equal(profile.requiresScaleConfirmation, false);
  assert.match(AISQSpec.buildPreface(answers), /confirmed Mvp delivery profile/i);
  const encoded = AISQSpec.serializeTemplate(answers);
  assert.deepEqual(AISQSpec.deserializeTemplate(encoded), answers);
});

test("canonical category and delivery profile retain custom detail without reopening confirmation", () => {
  const answers = {
    archetype: "saas",
    archetypeDetail: "A curated B2B vendor marketplace",
    scale: "production",
    scaleDetail: "Phased rollout to 50 enterprise customers"
  };
  const profile = AISQSpec.normalizeProjectProfile(answers);
  assert.equal(profile.archetype, "saas");
  assert.equal(profile.scale, "production");
  assert.equal(profile.isCustomArchetype, true);
  assert.equal(profile.isCustomScale, true);
  assert.equal(profile.requiresArchetypeReview, false);
  assert.equal(profile.requiresScaleConfirmation, false);
  assert.equal(profile.requiresReview, false);
  const preface = AISQSpec.buildPreface(answers);
  assert.match(preface, /Custom Product Category: A curated B2B vendor marketplace/);
  assert.match(preface, /Custom Project Size: Phased rollout to 50 enterprise customers/);
  assert.match(preface, /confirmed SaaS Platform profile/i);
  assert.match(preface, /confirmed production delivery profile/i);
  const stages = AISQSpec.resolveStages(answers).map((stage) => stage.id);
  assert.ok(stages.includes("security"));
  assert.ok(stages.includes("testing"));
});

test("custom context is text-only, template-safe, and materially appears in the generated preface", () => {
  const answers = {
    name: "Field Ops",
    customContext: [
      { label: "Operating constraint", value: "Must work offline for up to eight hours." },
      { label: "Rollout", value: "Pilot with two regional teams before national launch." }
    ]
  };
  assert.deepEqual(AISQSpec.normalizeCustomContext(answers.customContext), answers.customContext);
  const preface = AISQSpec.buildPreface(answers);
  assert.match(preface, /Tailored Context:/);
  assert.match(preface, /Operating constraint: Must work offline for up to eight hours\./);
  assert.match(preface, /Rollout: Pilot with two regional teams before national launch\./);
  assert.deepEqual(AISQSpec.deserializeTemplate(AISQSpec.serializeTemplate(answers)), answers);
});

test("deserializeTemplate rejects prototype pollution", () => {
  const bad = '{"__proto__":{"x":1},"name":"ok"}';
  const res = AISQSpec.deserializeTemplate(bad);
  assert.equal(res.name, "ok");
  assert.equal(res.__proto__ && res.__proto__.x, undefined); 
});

test("deserializeTemplate rejects arrays", () => {
  assert.equal(AISQSpec.deserializeTemplate('[1,2,3]'), null);
});

test("All archetypes at all scales split correctly", () => {
  const scales = AISQSpec.SCALES;
  const archs = Object.keys(AISQSpec.ARCHETYPES);
  for (const s of scales) {
    for (const a of archs) {
      const result = AISQSpec.assembleSpec({scale: s, archetype: a});
      console.log("Core keys: ", Object.keys(Core));
  const parsed = Core.parsePromptPack(result.raw, "stage");
      assert.equal(parsed.prompts.length, result.stageCount, `Failed for ${a} at ${s}`);
    }
  }
});

test("Enterprise scale produces 7+ stages", () => {
  const stages = AISQSpec.resolveStages({scale: "enterprise", archetype: "web-app"});
  assert.ok(stages.length >= 7);
});
