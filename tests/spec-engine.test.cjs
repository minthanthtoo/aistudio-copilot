const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../src/core.js");
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
    assert.match(preface, new RegExp(AISQSpec.GENRES[genre].label));
    assert.match(preface, new RegExp(AISQSpec.GENRES[genre].description.substring(0, 10)));
  }
});

test("Prompt quality: RFC-2119 language in production", () => {
  const result = AISQSpec.assembleSpec({ scale: "production" });
  // Should have MUST or SHALL or REQUIRE
  assert.ok(/MUST|SHALL|REQUIRE|must|shall/i.test(result.raw));
});
