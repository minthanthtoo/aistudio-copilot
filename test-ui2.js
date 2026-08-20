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
    ui: { draft: "" },
    settings: { pastePlacement: "end" },
    chains: []
  },
  el: (tag, options={}, children=[]) => {
    const node = document.createElement(tag);
    if (options.text) node.textContent = options.text;
    if (options.className) node.className = options.className;
    children.forEach(c => c && typeof c.append === 'function' ? node.append(c) : null);
    if (options.on && options.on.click) node.addEventListener("click", options.on.click);
    return node;
  },
  mutate: (fn) => fn(),
  requestRender: () => console.log("render called")
};

require('./src/ui-tabs.js');

const ui = global.globalThis.AISQContext.renderBuild();
const btns = ui.querySelectorAll('.aisq-quickstart-card');
console.log("Found buttons:", btns.length);
if (btns.length > 0) {
  btns[5].click();
  console.log("Clicked button 3, specAnswers:", global.globalThis.AISQContext.state.ui.specAnswers);
  console.log("buildView:", global.globalThis.AISQContext.state.ui.buildView);
}
