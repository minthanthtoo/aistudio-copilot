const fs = require('fs');

const correctOrder = [
  "src/core.js",
  "src/core-parser.js",
  "src/spec-data.js",
  "src/spec-engine.js",
  "src/chatgpt-extractor.js",
  "src/host-bridge.js",
  "src/runner.js",
  "src/ui-tabs.js",
  "src/content.js"
];

// 1. package-extension.cjs
let p = fs.readFileSync('scripts/package-extension.cjs', 'utf8');
p = p.replace(/"src\/core\.js".*?"src\/ui-tabs\.js",/s, correctOrder.map(f => `  "${f}",`).join('\\n'));
fs.writeFileSync('scripts/package-extension.cjs', p);

// 2. manifest.json
let m = fs.readFileSync('manifest.json', 'utf8');
m = m.replace(/"js": \[.*?\]/, `"js": ${JSON.stringify(correctOrder)}`);
fs.writeFileSync('manifest.json', m);

// 3. background.js
let b = fs.readFileSync('src/background.js', 'utf8');
b = b.replace(/const CONTENT_FILES = \[.*?\];/, `const CONTENT_FILES = ${JSON.stringify(correctOrder)};`);
fs.writeFileSync('src/background.js', b);

// 4. tests/manifest.test.cjs
let mt = fs.readFileSync('tests/manifest.test.cjs', 'utf8');
mt = mt.replace(/"src\/core\.js".*?"src\/ui-tabs\.js"/s, correctOrder.map(f => `"${f}"`).join(', '));
fs.writeFileSync('tests/manifest.test.cjs', mt);

// 5. tests/content.integration.test.cjs
let intTest = fs.readFileSync('tests/content.integration.test.cjs', 'utf8');
const evals = `
  window.eval(coreSource);
  window.eval(coreParserSource);
  window.eval(specDataSource);
  window.eval(specEngineSource);
  window.eval(hostBridgeSource);
  window.eval(runnerSource);
  window.eval(uiTabsSource);
  window.eval(contentSource);
`;
intTest = intTest.replace(/  window\.eval\(coreSource\);.*?window\.eval\(uiTabsSource\);/s, evals.trim());

const evalsEnv = `
  env.window.eval(coreSource);
  env.window.eval(coreParserSource);
  env.window.eval(specDataSource);
  env.window.eval(specEngineSource);
  env.window.eval(hostBridgeSource);
  env.window.eval(runnerSource);
  env.window.eval(uiTabsSource);
  env.window.eval(contentSource);
`;
intTest = intTest.replace(/  env\.window\.eval\(coreSource\);.*?env\.window\.eval\(uiTabsSource\);/s, evalsEnv.trim());

fs.writeFileSync('tests/content.integration.test.cjs', intTest);
