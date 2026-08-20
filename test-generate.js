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
global.chrome = { storage: { local: { get: (k, cb) => cb({}), set: (v, cb) => cb && cb() } } };

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
proxyState.ui = {
  draft: "", buildView: "wizard_details",
  specAnswers: { name: "Test", description: "test", frontend: "Vue", backend: "Python + FastAPI", database: "PostgreSQL", hosting: "Vercel", featureChips: [], stageOverrides: {} },
  splitStrategy: "stage",
  settings: { activeTab: "build" }
};

let renderCount = 0;
global.globalThis.AISQContext = {
  state: proxyState,
  el: (tag, options={}, children=[]) => {
    const node = document.createElement(tag);
    if (options.on && options.on.click) node.addEventListener("click", options.on.click);
    children.forEach(c => c && typeof c.append === 'function' ? node.append(c) : null);
    if (options.text) node.textContent = options.text;
    return node;
  },
  mutate: fn => fn(), 
  requestRender: () => { renderCount++; console.log("requestRender called"); },
  command: (type, payload) => {
    console.log("COMMAND FIRED:", type);
    return AISQCore.applyCommand(proxyState, { type, payload });
  },
  toast: (msg) => { console.log("TOAST:", msg); }, 
  startRunner: () => { console.log("startRunner called"); }
};

require('./src/ui-tabs.js');

const ctx = global.globalThis.AISQContext;
const ui = ctx.renderBuild();
const buttons = Array.from(ui.querySelectorAll("button"));
const genBtn = buttons.find(b => b.textContent.includes("Generate"));
console.log("Found Generate Button:", !!genBtn);
if (genBtn) {
  try {
    genBtn.click();
    console.log("Click successful.");
  } catch (e) {
    console.error("CLICK ERROR:", e);
  }
}
