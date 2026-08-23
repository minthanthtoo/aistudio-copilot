const fs = require('fs');
require('./src/core.js');
require('./src/spec-data.js');
require('./src/spec-engine.js');

const answers = { name: "Test App", archetype: "web-app", scale: "prototype" };
const overrides = {};
const result = AISQSpec.assembleSpec(answers, overrides);
console.log(result);
