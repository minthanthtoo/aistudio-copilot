const fs = require('fs');

// Fix content.js exports
let text = fs.readFileSync('src/content.js', 'utf8');
const exportHook = `
    currentPageKey: function(...args) { return currentPageKey(...args); },
    isAppsListUpgrade: function(...args) { return isAppsListUpgrade(...args); }
  };
  const ctx = globalThis.AISQContext;
`;
text = text.replace(/  };\n  const ctx = globalThis\.AISQContext;/, exportHook.trim() + '\n');
fs.writeFileSync('src/content.js', text);

// Fix test imports
let testText = fs.readFileSync('tests/content.integration.test.cjs', 'utf8');
testText = testText.replace(/const Core = require\("\.\.\/src\/core\.js"\);\n/, 'const Core = require("../src/core.js");\nrequire("../src/core-parser.js");\n');
fs.writeFileSync('tests/content.integration.test.cjs', testText);
