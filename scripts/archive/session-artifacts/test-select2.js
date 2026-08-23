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
state.ui = {
  draft: "", buildView: "wizard_details",
  specAnswers: { name: "Test", description: "test", scale: "mvp", frontend: "Vue", backend: "Python + FastAPI", database: "PostgreSQL", hosting: "Vercel", featureChips: [], stageOverrides: {} },
  splitStrategy: "stage"
};

global.globalThis.AISQContext = {
  state,
  mutate: fn => fn(), requestRender: () => {},
  command: (type, payload) => ({ok:true}),
  toast: () => {}, startRunner: () => {}
};

require('./src/ui-tabs.js');

const ctx = global.globalThis.AISQContext;
const ui = ctx.renderBuild();

const selects = ui.querySelectorAll("select");
console.log("Found " + selects.length + " selects");
selects.forEach((s, i) => {
  const selected = s.querySelector("option:checked");
  console.log("  [" + i + "] value=" + JSON.stringify(s.value) + ", selectedText=" + JSON.stringify(selected ? selected.textContent : "NONE"));
});

// Test changing the select
if (selects.length >= 4) {
  selects[2].value = "React";
  selects[2].dispatchEvent(new dom.window.Event("change"));
  console.log("After change, frontend =", state.ui.specAnswers.frontend);
}
