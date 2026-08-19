const test = require("node:test");
const assert = require("node:assert/strict");

const AISQSpec = require("../src/spec-engine.js");

test("Spec Engine API available", () => {
  assert.ok(AISQSpec);
  assert.ok(AISQSpec.ARCHETYPES);
  assert.ok(AISQSpec.SCALES);
  assert.ok(AISQSpec.assembleSpec);
});

test("inferDefaults - fills missing data intelligently", () => {
  const result = AISQSpec.inferDefaults({
    archetype: "e-commerce",
    scale: "mvp"
  });

  assert.equal(result.frontend, "Next.js");
  assert.equal(result.backend, "Next.js API Routes");
  assert.equal(result.database, "PostgreSQL");
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
  assert.match(preface, /Mobile-First/);
  assert.match(preface, /production quality/);
});

test("assembleSpec - Hobby Scale (Combined prompt)", () => {
  const result = AISQSpec.assembleSpec({
    name: "MyBlog",
    archetype: "portfolio",
    scale: "hobby",
    features: "Show my posts"
  });

  assert.equal(result.strategy, "stage");
  assert.equal(result.stageCount, 1);
  assert.match(result.raw, /## Stage 1 — Complete Application Build/);
  assert.ok(result.preface.length > 0);
});

test("assembleSpec - Production Scale (Multi-stage prompt)", () => {
  const result = AISQSpec.assembleSpec({
    name: "EnterpriseApp",
    archetype: "web-app",
    scale: "production",
    features: "Lots of stuff"
  });

  assert.equal(result.strategy, "stage");
  assert.ok(result.stageCount > 3);
  assert.match(result.raw, /## Stage 1 — /);
  assert.match(result.raw, /## Stage 2 — /);
});

test("getVisibleSections - conditional visibility", () => {
  const hobby = AISQSpec.getVisibleSections({ scale: "hobby" });
  assert.equal(hobby.features, true);
  assert.equal(hobby.techStack, false);
  assert.equal(hobby.security, false);

  const prod = AISQSpec.getVisibleSections({ scale: "production" });
  assert.equal(prod.techStack, true);
  assert.equal(prod.security, true);
  assert.equal(prod.advanced, false);
});
