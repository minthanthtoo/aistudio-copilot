const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// Load the extractor script in a pseudo-browser environment
const globalEnv = {};
const script = fs.readFileSync(path.join(__dirname, "../src/chatgpt-extractor.js"), "utf-8");
new Function("globalThis", script)(globalEnv);
const api = globalEnv.AISQChatGPTExtractor;

test("chatgpt-extractor exists and exposes api", (t) => {
  assert.ok(api);
  assert.ok(typeof api.extractConversation === "function");
  assert.ok(typeof api.analyzeTranscript === "function");
});

test("analyzeTranscript works", (t) => {
  const conversation = {
    title: "Test Chat",
    visibleMessages: [
      { role: "user", text: "I want to build a React mobile app with Firebase backend and dark mode." },
      { role: "assistant", text: "Sure! Let's do it.\n- Setup React Native\n- Configure Firebase" }
    ]
  };

  const spec = api.analyzeTranscript(conversation);
  assert.strictEqual(spec.name, "Test Chat");
  assert.strictEqual(spec.archetype, "mobile-app");
  assert.strictEqual(spec.frontend, "React"); // could be React Native but React is detected
  assert.strictEqual(spec.backend, "Firebase");
  assert.strictEqual(spec.darkMode, true);
  assert.ok(spec.features.includes("Setup React Native"));
  assert.ok(spec.features.includes("Configure Firebase"));
});
