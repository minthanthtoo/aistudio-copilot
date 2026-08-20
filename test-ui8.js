require('./src/core.js');
require('./src/core-parser.js');
require('./src/spec-data.js');
require('./src/spec-engine.js');
const specApi = globalThis.AISQSpec;
const inferred = specApi.inferDefaults({ name: "test", featureChips: [] });
const result = specApi.assembleSpec(inferred, {});
const parsed = AISQCore.parsePromptPack(result.raw, result.strategy);
console.log("Raw output length:", result.raw.length);
console.log("Stage count:", result.stageCount);
console.log("Parsed prompts count:", parsed.prompts.length);
if (parsed.prompts.length > 0) {
  console.log("First prompt title:", parsed.prompts[0].title);
} else {
  console.log("NO PROMPTS PARSED!");
}
