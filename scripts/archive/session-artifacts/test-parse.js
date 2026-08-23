const fs = require('fs');
require('./src/core.js');
require('./src/core-parser.js');
require('./src/spec-data.js');
require('./src/spec-engine.js');

const answers = { name: "Test App", archetype: "web-app", scale: "prototype" };
const overrides = {};
const result = AISQSpec.assembleSpec(answers, overrides);

const parsed = AISQCore.parsePromptPack(result.raw, result.strategy);
console.log("Parsed prompts count:", parsed.prompts.length);
console.log("Parsed strategy:", parsed.strategy);
