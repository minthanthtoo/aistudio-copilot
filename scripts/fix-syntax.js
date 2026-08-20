const fs = require('fs');
let text = fs.readFileSync('src/content.js', 'utf8');
text = text.replace(/function ctx\.currentPageKey/g, 'function currentPageKey');
text = text.replace(/function ctx\.isAppsListUpgrade/g, 'function isAppsListUpgrade');

// Find the init() and mount() at the END of the file and defer them.
// ONLY the ones at the end.
text = text.replace(/  mount\(\);\n  init\(\);\n\}\)\(\);/g, '  Promise.resolve().then(() => { mount(); init(); });\n})();');

fs.writeFileSync('src/content.js', text);
