const fs = require('fs');
let text = fs.readFileSync('tests/manifest.test.cjs', 'utf8');
text = text.replace(/"src\/core\.js",\s*"src\/spec-engine\.js",\s*"src\/chatgpt-extractor\.js",\s*"src\/content\.js"/g, '"src/core.js", "src/core-parser.js", "src/spec-data.js", "src/spec-engine.js", "src/chatgpt-extractor.js", "src/content.js", "src/host-bridge.js", "src/runner.js", "src/ui-tabs.js"');
fs.writeFileSync('tests/manifest.test.cjs', text);
