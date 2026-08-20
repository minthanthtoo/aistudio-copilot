const fs = require('fs');
require('./src/core.js');
require('./src/core-parser.js');

const state = {
  chains: [],
  stackOrder: [],
  selectedChainId: null,
  ui: {},
  runner: { activeChainId: null, enabled: false }
};

const raw = "## Stage 1\n\nPrompt 1\n\n## Stage 2\n\nPrompt 2";
const parsed = AISQCore.parsePromptPack(raw, "stage");
const chain = AISQCore.makeChain("Test", parsed.prompts, raw, { splitStrategy: "stage" });
const res = AISQCore.applyCommand(state, { type: "IMPORT_CHAIN", payload: { chain, placement: "bottom" }});

console.log("stackOrder:", state.stackOrder);
console.log("chains:", state.chains.map(c => c.id));
const target = AISQCore.nextStackTarget(state);
console.log("target:", target ? target.prompt.text : "null");

