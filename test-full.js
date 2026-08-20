const fs = require('fs');
require('./src/core.js');
require('./src/core-parser.js');

const state = {
  chains: [],
  stackOrder: [],
  selectedChainId: null,
  ui: {},
  settings: {},
  runner: { activeChainId: null, enabled: false, lastError: null, pendingPromptId: null, phase: null }
};

global.chrome = { runtime: { sendMessage: (msg, cb) => cb({ ok: true, isOwner: true }) } };

global.globalThis.AISQContext = {
  state,
  mutate: (fn) => fn(),
  requestRender: () => {},
  currentPageKey: () => "test_page",
  addHistory: () => {},
  command: (type, payload) => AISQCore.applyCommand(state, { type, payload })
};

require('./src/runner.js');

function importText(raw, strategy) {
  const parsed = AISQCore.parsePromptPack(raw, strategy);
  const number = (state.chains || []).length + 1;
  const chain = AISQCore.makeChain(`Chain ${number}`, parsed.prompts, raw, { splitStrategy: parsed.strategy, pastedAt: AISQCore.nowISO(), preface: parsed.preface });
  const commandResult = global.globalThis.AISQContext.command("IMPORT_CHAIN", { chain, placement: "bottom" });
  return commandResult;
}

const raw = "## Stage 1\n\nPrompt 1\n\n## Stage 2\n\nPrompt 2";
importText(raw, "stage");
console.log("stackOrder:", state.stackOrder);
console.log("chains:", state.chains.map(c => c.id));
