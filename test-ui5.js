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

global.chrome = { 
  storage: { local: { get: (k, cb) => cb({ aisqTemplates: [] }), set: (v, cb) => cb() } },
  runtime: { sendMessage: () => {} }
};

require('./src/core.js');
require('./src/core-parser.js');
require('./src/spec-data.js');
require('./src/spec-engine.js');

const state = AISQCore.defaultState();
state.ui = { draft: "", specAnswers: { name: "test", featureChips: [] }, showAdvanced: true, splitStrategy: "stage" };

global.globalThis.AISQContext = {
  state,
  el: (tag, options={}, children=[]) => {
    const node = document.createElement(tag);
    if (options.text) node.textContent = options.text;
    if (options.className) node.className = options.className;
    children.forEach(c => c && typeof c.append === 'function' ? node.append(c) : null);
    if (options.on && options.on.click) node.addEventListener("click", options.on.click);
    return node;
  },
  mutate: (fn) => fn(),
  requestRender: () => console.log("render called"),
  command: (type, payload) => { console.log("chains is:", typeof state.chains); return AISQCore.applyCommand(state, { type, payload }); },
  toast: console.log,
  startRunner: () => console.log("runner started!")
};

require('./src/ui-tabs.js');

global.globalThis.AISQContext.state.ui.buildView = "wizard_details";
const ui = global.globalThis.AISQContext.renderBuild();
const buttons = Array.from(ui.querySelectorAll("button"));
const generateBtn = buttons.find(b => b.textContent.includes("Generate"));
console.log("Generate Btn:", generateBtn ? generateBtn.textContent : "not found");
if (generateBtn) {
  try {
    generateBtn.click();
    console.log("Clicked successfully");
  } catch(e) {
    console.error("Click error:", e);
  }
}
