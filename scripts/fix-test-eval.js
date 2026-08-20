const fs = require('fs');
let text = fs.readFileSync('tests/content.integration.test.cjs', 'utf8');

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

text = text.replace(/window\.eval\(coreSource\);\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n/m, evals.trim() + '\n');
text = text.replace(/env\.window\.eval\(coreSource\);\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n/m, evalsEnv.trim() + '\n');

fs.writeFileSync('tests/content.integration.test.cjs', text);
