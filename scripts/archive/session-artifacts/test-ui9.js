const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
global.document = dom.window.document;
global.window = dom.window;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.Blob = dom.window.Blob;
global.URL = dom.window.URL;
URL.createObjectURL = () => "blob:url";
URL.revokeObjectURL = () => {};

global.chrome = { storage: { local: { get: (k, cb) => cb({ aisqTemplates: [] }), set: (v, cb) => cb() } }, runtime: { sendMessage: () => {} } };

require('./src/core.js');
require('./src/core-parser.js');
require('./src/spec-data.js');
require('./src/spec-engine.js');

const state = AISQCore.defaultState();
// Set up projects proxy properly!
state.projects["mock-page-key"] = { chains: [], stackOrder: [], selectedChainId: null };
AISQCore.getCurrentPageKey = () => "mock-page-key";
const proxyState = new Proxy(state, {
  get(target, prop) {
    if (["chains", "stackOrder", "selectedChainId"].includes(prop)) return target.projects["mock-page-key"][prop];
    return target[prop];
  }
});
proxyState.ui = { draft: "", specAnswers: { name: "test", featureChips: [] }, showAdvanced: true, splitStrategy: "stage" };

global.globalThis.AISQContext = {
  state: proxyState,
  el: (tag, options={}, children=[]) => {
    const node = document.createElement(tag);
    if (options.on && options.on.click) node.addEventListener("click", options.on.click);
    return node;
  },
  mutate: (fn) => fn(),
  requestRender: () => {},
  command: (type, payload) => { return AISQCore.applyCommand(proxyState, { type, payload }); },
  toast: () => {},
  startRunner: () => {}
};

require('./src/ui-tabs.js');

global.globalThis.AISQContext.state.ui.buildView = "wizard_details";
const ui = global.globalThis.AISQContext.renderBuild();
const generateBtn = Array.from(ui.querySelectorAll("button")).find(b => b.textContent.includes("Add to Queue"));
if (generateBtn) {
  try {
    generateBtn.click();
    console.log("Submit completed without throwing.");
  } catch(e) {
    console.error("Submit threw error:", e);
  }
}
