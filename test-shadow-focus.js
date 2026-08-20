const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="host"></div></body></html>`);
const host = dom.window.document.getElementById("host");
const shadow = host.attachShadow({ mode: "open" });
const input = dom.window.document.createElement("input");
shadow.appendChild(input);
input.focus();

console.log("document.activeElement === host:", dom.window.document.activeElement === host);
console.log("shadow.activeElement === input:", shadow.activeElement === input);

if (dom.window.document.activeElement?.blur) {
  dom.window.document.activeElement.blur();
}
console.log("After document.activeElement.blur(), shadow.activeElement === input:", shadow.activeElement === input);

if (shadow.activeElement?.blur) {
  shadow.activeElement.blur();
}
console.log("After shadow.activeElement.blur(), shadow.activeElement === input:", shadow.activeElement === input);
