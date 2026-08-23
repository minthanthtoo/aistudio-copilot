const fs = require('fs');
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

global.chrome = { storage: { local: { get: (k, cb) => cb({ aisqTemplates: [] }), set: (v, cb) => cb() } } };

require('./src/core.js');
require('./src/core-parser.js');
require('./src/spec-data.js');
require('./src/spec-engine.js');

global.globalThis.AISQContext = {
  state: {
    ui: { specAnswers: { name: "test", featureChips: [] }, showAdvanced: true, splitStrategy: "stage" },
    settings: { pastePlacement: "end" }
  },
  el: (tag, options={}, children=[]) => {
    const node = document.createElement(tag);
    if (options.text) node.textContent = options.text;
    children.forEach(c => c && typeof c.append === 'function' ? node.append(c) : null);
    if (options.on && options.on.click) node.click = options.on.click;
    return node;
  },
  mutate: (fn) => fn(),
  requestRender: () => {},
  command: (type, payload) => ({ok: true}),
  toast: console.log,
  init: async () => {}
};

require('./src/ui-tabs.js');

try {
  const ui = global.globalThis.AISQContext.renderBuild();
  console.log("Built UI.");
} catch (e) {
  console.error(e);
}
