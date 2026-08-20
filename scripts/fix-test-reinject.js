const fs = require('fs');
let text = fs.readFileSync('tests/content.integration.test.cjs', 'utf8');

const envEvals = `
  env.window.eval(contentSource);
  env.window.eval(hostBridgeSource);
  env.window.eval(runnerSource);
  env.window.eval(uiTabsSource);
`;
text = text.replace(/  env\.window\.eval\(contentSource\);/, envEvals.trim());

fs.writeFileSync('tests/content.integration.test.cjs', text);
