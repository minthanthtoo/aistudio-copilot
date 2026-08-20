global.Node = class {}; const fs = require('fs');
require('./src/core.js');
require('./src/core-parser.js');

const state = {
  chains: [],
  stackOrder: [],
  selectedChainId: null,
  ui: {},
  runner: { activeChainId: null, enabled: false, lastError: null, pendingPromptId: null, phase: null }
};

global.chrome = { runtime: { sendMessage: (msg, cb) => cb({ ok: true, isOwner: true }) } };

global.globalThis.AISQContext = {
  state,
  mutate: (fn) => fn(),
  requestRender: () => {}, currentPageKey: () => "test_page", addHistory: () => {}
};

require('./src/runner.js');

const raw = "## Stage 1\n\nPrompt 1\n\n## Stage 2\n\nPrompt 2";
const parsed = AISQCore.parsePromptPack(raw, "stage");
const chain = AISQCore.makeChain("Test", parsed.prompts, raw, { splitStrategy: "stage" });
AISQCore.applyCommand(state, { type: "IMPORT_CHAIN", payload: { chain, placement: "bottom" }});

console.log("Before start:", state.runner);
global.globalThis.AISQContext.startRunner().then(() => {
  console.log("After start:", state.runner);
});
