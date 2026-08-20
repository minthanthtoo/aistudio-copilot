const fs = require('fs');
let mt = fs.readFileSync('tests/manifest.test.cjs', 'utf8');

// The test hardcoded the expected JSON string
mt = mt.replace(
  /"src\/core\.js","src\/core-parser\.js","src\/spec-data\.js","src\/spec-engine\.js","src\/chatgpt-extractor\.js","src\/content\.js","src\/host-bridge\.js","src\/runner\.js","src\/ui-tabs\.js"/,
  '"src/core.js","src/core-parser.js","src/spec-data.js","src/spec-engine.js","src/chatgpt-extractor.js","src/host-bridge.js","src/runner.js","src/ui-tabs.js","src/content.js"'
);

fs.writeFileSync('tests/manifest.test.cjs', mt);
