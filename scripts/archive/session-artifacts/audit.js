const fs = require('fs');

const core = fs.readFileSync('src/core.js', 'utf8');
const runner = fs.readFileSync('src/runner.js', 'utf8');
const content = fs.readFileSync('src/content.js', 'utf8');
const evidence = fs.readFileSync('src/evidence.js', 'utf8');

console.log("--- Audit Report ---");
console.log("1. LAW 1: Direct state mutations in runner.js");
const phaseMutations = runner.split('\n').filter(l => l.includes('ctx.state.runner.phase ='));
console.log(`Found ${phaseMutations.length} direct phase mutations. Plan suggested keeping them in Phase 1, but refactoring later.`);

console.log("\n2. LAW 2: No evidence, no completion");
const completePrompt = runner.substring(runner.indexOf('case "complete_prompt":'), runner.indexOf('break;', runner.indexOf('case "complete_prompt":') + 100));
console.log("complete_prompt logic checks evidence verdict? " + completePrompt.includes("evidence.verdict === 'FAIL'"));

console.log("\n3. Storage Adapter");
const storageCalls = content.split('\n').filter(l => l.includes('chrome.storage') && !l.includes('adapter'));
console.log(`chrome.storage direct calls in content.js: ${storageCalls.length}`);
storageCalls.forEach(l => console.log(l.trim()));

