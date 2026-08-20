const fs = require('fs');
let text = fs.readFileSync('tests/content.integration.test.cjs', 'utf8');

const reads = `
const coreSource = fs.readFileSync(path.join(projectRoot, "src/core.js"), "utf8");
const coreParserSource = fs.readFileSync(path.join(projectRoot, "src/core-parser.js"), "utf8");
const specDataSource = fs.readFileSync(path.join(projectRoot, "src/spec-data.js"), "utf8");
const specEngineSource = fs.readFileSync(path.join(projectRoot, "src/spec-engine.js"), "utf8");
const contentSource = fs.readFileSync(path.join(projectRoot, "src/content.js"), "utf8");
const hostBridgeSource = fs.readFileSync(path.join(projectRoot, "src/host-bridge.js"), "utf8");
const runnerSource = fs.readFileSync(path.join(projectRoot, "src/runner.js"), "utf8");
const uiTabsSource = fs.readFileSync(path.join(projectRoot, "src/ui-tabs.js"), "utf8");
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
text = text.replace(/  window\.eval\(coreSource\);\n  window\.eval\(contentSource\);/, evals.trim());

const envEvals = `
  env.window.eval(coreSource);
  env.window.eval(coreParserSource);
  env.window.eval(specDataSource);
  env.window.eval(specEngineSource);
  env.window.eval(contentSource);
  env.window.eval(hostBridgeSource);
  env.window.eval(runnerSource);
  env.window.eval(uiTabsSource);
`;
text = text.replace(/  env\.window\.eval\(coreSource\);\n  env\.window\.eval\(contentSource\);/, envEvals.trim());

fs.writeFileSync('tests/content.integration.test.cjs', text);
