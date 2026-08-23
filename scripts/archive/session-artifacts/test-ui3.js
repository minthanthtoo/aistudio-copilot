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

require('./src/core.js');
require('./src/core-parser.js');
require('./src/spec-data.js');
require('./src/spec-engine.js');

global.globalThis.AISQContext = {
  state: {
    ui: { draft: "", specAnswers: { name: "test", featureChips: [] }, showAdvanced: true, splitStrategy: "stage" },
    settings: { pastePlacement: "end" },
    chains: []
  },
  el: (tag, options={}, children=[]) => {
    const node = document.createElement(tag);
    if (options.text) node.textContent = options.text;
    if (options.className) node.className = options.className;
    children.forEach(c => c && typeof c.append === 'function' ? node.append(c) : null);
    return node;
  },
  mutate: (fn) => fn(),
  requestRender: () => console.log("render called")
};

require('./src/ui-tabs.js');

try {
  const ui = global.globalThis.AISQContext.renderBuild();
  console.log("Wizard rendered.");
} catch(e) {
  console.error(e);
}
