const fs = require('fs');

const correctOrder = [
  "src/core.js",
  "src/core-parser.js",
  "src/spec-data.js",
  "src/spec-engine.js",
  "src/chatgpt-extractor.js",
  "src/content.js",
  "src/host-bridge.js",
  "src/runner.js",
  "src/ui-tabs.js"
];

// 1. package-extension.cjs
let p = fs.readFileSync('scripts/package-extension.cjs', 'utf8');
p = p.replace(/"src\/core\.js".*?"src\/content\.js"/s, correctOrder.map(f => `  "${f}"`).join(',\n'));
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
mt = mt.replace(/"src\/core\.js".*?"src\/content\.js"/s, correctOrder.map(f => `"${f}"`).join(', '));
fs.writeFileSync('tests/manifest.test.cjs', mt);

// 5. tests/content.integration.test.cjs
let intTest = fs.readFileSync('tests/content.integration.test.cjs', 'utf8');
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
intTest = intTest.replace(/window\.eval\(coreSource\);\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n/m, evals.trim() + '\n');

const evalsEnv = `
  env.window.eval(coreSource);
  env.window.eval(coreParserSource);
  env.window.eval(specDataSource);
  env.window.eval(specEngineSource);
  env.window.eval(contentSource);
  env.window.eval(hostBridgeSource);
  env.window.eval(runnerSource);
  env.window.eval(uiTabsSource);
`;
intTest = intTest.replace(/env\.window\.eval\(coreSource\);\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n/m, evalsEnv.trim() + '\n');

fs.writeFileSync('tests/content.integration.test.cjs', intTest);
