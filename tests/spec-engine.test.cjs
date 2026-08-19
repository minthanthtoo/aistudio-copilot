const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../src/core.js");
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
