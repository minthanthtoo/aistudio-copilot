const fs = require('fs');

const intTest = 'tests/content.integration.test.cjs';
let text = fs.readFileSync(intTest, 'utf8');

const reads = `
const coreSource = fs.readFileSync(path.join(projectRoot, "src/core.js"), "utf8");
const coreParserSource = fs.readFileSync(path.join(projectRoot, "src/core-parser.js"), "utf8");
const specDataSource = fs.readFileSync(path.join(projectRoot, "src/spec-data.js"), "utf8");
const specEngineSource = fs.readFileSync(path.join(projectRoot, "src/spec-engine.js"), "utf8");
const hostBridgeSource = fs.readFileSync(path.join(projectRoot, "src/host-bridge.js"), "utf8");
const uiTabsSource = fs.readFileSync(path.join(projectRoot, "src/ui-tabs.js"), "utf8");
const runnerSource = fs.readFileSync(path.join(projectRoot, "src/runner.js"), "utf8");
const contentSource = fs.readFileSync(path.join(projectRoot, "src/content.js"), "utf8");
`;

text = text.replace(/const coreSource = [^\n]+\nconst contentSource = [^\n]+/, reads.trim());

const evals = `
  window.eval(coreSource);
  window.eval(coreParserSource);
  window.eval(specDataSource);
  window.eval(specEngineSource);
  window.eval(contentSource);
  window.eval(hostBridgeSource);
  window.eval(runnerSource);
  window.eval(uiTabsSource);
`;

text = text.replace(/  window\.eval\(coreSource\);\n  window\.eval\(contentSource\);/g, evals.trim());

// We also need to fix `env.window.eval(contentSource)` on line 132.
text = text.replace(/  env\.window\.eval\(contentSource\);/g, evals.trim().replace(/window\.eval/g, 'env.window.eval'));

// Also inject require core-parser into Core for Node.js usage at the top
text = text.replace('const Core = require("../src/core.js");', 'const Core = require("../src/core.js");\nObject.assign(Core, require("../src/core-parser.js"));');

fs.writeFileSync(intTest, text);
