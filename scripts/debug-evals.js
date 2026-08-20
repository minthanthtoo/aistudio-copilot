const fs = require('fs');
let text = fs.readFileSync('tests/content.integration.test.cjs', 'utf8');
const replaceEvals = `
  const files = {
    coreSource, coreParserSource, specDataSource, specEngineSource,
    contentSource, hostBridgeSource, runnerSource, uiTabsSource
  };
  for (const [name, source] of Object.entries(files)) {
    try {
      window.eval(source);
    } catch (e) {
      console.error("EVAL ERROR in " + name + ":", e.message);
      throw e;
    }
  }
`;
text = text.replace(/  window\.eval\(coreSource\);\n  window\.eval\(coreParserSource\);\n  window\.eval\(specDataSource\);\n  window\.eval\(specEngineSource\);\n  window\.eval\(contentSource\);\n  window\.eval\(hostBridgeSource\);\n  window\.eval\(runnerSource\);\n  window\.eval\(uiTabsSource\);/g, replaceEvals.trim());
fs.writeFileSync('tests/content.integration.test.cjs', text);
