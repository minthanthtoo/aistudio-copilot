const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const dom = new JSDOM(`<!DOCTYPE html><html><body><details><summary id="sum">Hello</summary></details></body></html>`);
const sum = dom.window.document.getElementById("sum");
sum.focus();
console.log(dom.window.document.activeElement === sum);
console.log(sum.matches("input, textarea, select"));
