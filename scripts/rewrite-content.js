const fs = require('fs');
const content = fs.readFileSync('src/content.js', 'utf8');
const lines = content.split('\n');

const mainLines = [
  ...lines.slice(0, 42),
  ...lines.slice(279, 437),
  ...lines.slice(2306, lines.length)
];

let text = mainLines.join('\n');
const hook = `  const clickedOptInControls = new WeakSet();

  globalThis.AISQContext = {
    get state() { return state; },
    set state(v) { state = v; },
    get persistedRevision() { return persistedRevision; },
    set persistedRevision(v) { persistedRevision = v; },
    get rootHost() { return rootHost; },
    set rootHost(v) { rootHost = v; },
    get shadow() { return shadow; },
    set shadow(v) { shadow = v; },
    get panel() { return panel; },
    set panel(v) { panel = v; },
    get statusLine() { return statusLine; },
    set statusLine(v) { statusLine = v; },
    get tickBusy() { return tickBusy; },
    set tickBusy(v) { tickBusy = v; },
    get saveTimer() { return saveTimer; },
    set saveTimer(v) { saveTimer = v; },
    get saveQueue() { return saveQueue; },
    set saveQueue(v) { saveQueue = v; },
    get tickIntervalId() { return tickIntervalId; },
    set tickIntervalId(v) { tickIntervalId = v; },
    get renderQueued() { return renderQueued; },
    set renderQueued(v) { renderQueued = v; },
    get lastHostSignature() { return lastHostSignature; },
    set lastHostSignature(v) { lastHostSignature = v; },
    get exportStep() { return exportStep; },
    set exportStep(v) { exportStep = v; },
    get tabId() { return tabId; },
    set tabId(v) { tabId = v; },
    get leaseToken() { return leaseToken; },
    set leaseToken(v) { leaseToken = v; },
    get lastLeaseHeartbeatAt() { return lastLeaseHeartbeatAt; },
    set lastLeaseHeartbeatAt(v) { lastLeaseHeartbeatAt = v; },
    get runnerOwnedByOtherTab() { return runnerOwnedByOtherTab; },
    set runnerOwnedByOtherTab(v) { runnerOwnedByOtherTab = v; },
    clickedOptInControls,
    
    // Core functions
    addHistory: function(...args) { return addHistory(...args); },
    enqueueSave: function(...args) { return enqueueSave(...args); },
    touchState: function(...args) { return touchState(...args); },
    scheduleSave: function(...args) { return scheduleSave(...args); },
    mutate: function(...args) { return mutate(...args); },
    command: function(...args) { return command(...args); },
    requestRender: function(...args) { return requestRender(...args); },
    selectedChain: function(...args) { return selectedChain(...args); },
    runnerChain: function(...args) { return runnerChain(...args); },
    runnerPrompt: function(...args) { return runnerPrompt(...args); }
  };
  const ctx = globalThis.AISQContext;
`;

text = text.replace('  const clickedOptInControls = new WeakSet();', hook);

const extractedFuncs = ['startRunner', 'pauseRunner', 'resumeRunner', 'recoverPendingHere', 'skipPrompt', 'downloadZip', 'createDiagnosticSnapshot', 'downloadDiagnostics', 'el', 'button', 'field', 'importText', 'visibleAll', 'exactButton', 'waitForElement', 'textOf', 'scanHost', 'scanHostCached', 'setNativeValue', 'robustClick', 'clickOptInControls', 'renderCountdowns', 'stopActiveAI', 'renderTopRunControls', 'renderBuild', 'renderStack', 'renderPrompts', 'renderRun', 'renderSettings'];

extractedFuncs.forEach(v => {
  const regex = new RegExp(`(?<!\\.|function\\s+)\\b${v}\\b(?=\\s*\\()`, 'g');
  text = text.replace(regex, `ctx.${v}`);
});

fs.writeFileSync('src/content.js', text);
