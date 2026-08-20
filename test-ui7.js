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
state.ui = { draft: "", specAnswers: { name: "test", featureChips: [] }, showAdvanced: true, splitStrategy: "stage" };

global.globalThis.AISQContext = {
  state,
  el: (tag, options={}, children=[]) => {
    const node = document.createElement(tag);
    if (options.on && options.on.click) node.addEventListener("click", options.on.click);
    return node;
  },
  mutate: (fn) => fn(),
  requestRender: () => {},
  command: (type, payload) => { return {ok:true}; },
  toast: () => {},
  startRunner: () => {}
};

console.log("Keys before:", Object.keys(global.globalThis.AISQContext.state));
require('./src/ui-tabs.js');
console.log("Keys after:", Object.keys(global.globalThis.AISQContext.state));
