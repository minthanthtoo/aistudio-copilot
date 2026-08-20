const fs = require('fs');

// manifest.json
let m = fs.readFileSync('manifest.json', 'utf8');
m = m.replace(/"js": \[.*?\]/, '"js": ["src/core.js", "src/core-parser.js", "src/spec-data.js", "src/spec-engine.js", "src/chatgpt-extractor.js", "src/content.js", "src/host-bridge.js", "src/runner.js", "src/ui-tabs.js"]');
fs.writeFileSync('manifest.json', m);

// background.js
let b = fs.readFileSync('src/background.js', 'utf8');
b = b.replace(/const CONTENT_FILES = \[.*?\];/, 'const CONTENT_FILES = ["src/core.js", "src/core-parser.js", "src/spec-data.js", "src/spec-engine.js", "src/chatgpt-extractor.js", "src/content.js", "src/host-bridge.js", "src/runner.js", "src/ui-tabs.js"];');
fs.writeFileSync('src/background.js', b);

// package-extension.cjs
let p = fs.readFileSync('scripts/package-extension.cjs', 'utf8');
p = p.replace(/"src\/core\.js",\s*"src\/spec-engine\.js",\s*"src\/chatgpt-extractor\.js",\s*"src\/content\.js",/g, '"src/core.js",\n  "src/core-parser.js",\n  "src/spec-data.js",\n  "src/spec-engine.js",\n  "src/chatgpt-extractor.js",\n  "src/content.js",\n  "src/host-bridge.js",\n  "src/runner.js",\n  "src/ui-tabs.js",');
fs.writeFileSync('scripts/package-extension.cjs', p);
