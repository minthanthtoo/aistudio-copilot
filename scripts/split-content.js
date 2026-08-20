const fs = require('fs');
const content = fs.readFileSync('src/content.js', 'utf8');
const lines = content.split('\n');

const extracts = {
  'AISQHost': {
    lines: [
      ...lines.slice(42, 279), // visible to scanHostCached
      ...lines.slice(1090, 1223) // downloadZip to downloadDiagnostics
    ]
  },
  'AISQRunner': {
    lines: [
      ...lines.slice(437, 1090) // acquireRunnerLease to resetCurrentChain
    ]
  },
  'AISQUI': {
    lines: [
      ...lines.slice(1224, 2306) // el() to renderTopRunControls()
    ]
  }
};

const allVars = ['state', 'mutate', 'command', 'requestRender', 'shadow', 'panel', 'statusLine', 'tabId', 'leaseToken', 'runnerOwnedByOtherTab', 'clickedOptInControls', 'persistedRevision', 'rootHost', 'tickBusy', 'saveTimer', 'saveQueue', 'tickIntervalId', 'renderQueued', 'lastHostSignature', 'exportStep', 'lastLeaseHeartbeatAt', 'addHistory', 'enqueueSave', 'touchState', 'scheduleSave', 'startRunner', 'pauseRunner', 'resumeRunner', 'recoverPendingHere', 'skipPrompt', 'downloadZip', 'createDiagnosticSnapshot', 'downloadDiagnostics', 'el', 'button', 'field', 'importText', 'visibleAll', 'exactButton', 'waitForElement', 'textOf', 'scanHost', 'scanHostCached', 'setNativeValue', 'robustClick', 'clickOptInControls', 'renderCountdowns', 'runnerChain', 'runnerPrompt', 'selectedChain', 'stopActiveAI', 'renderTopRunControls', 'installStyles'];

for (const [name, data] of Object.entries(extracts)) {
  let text = data.lines.join('\n');
  const declared = new Set();
  
  allVars.forEach(v => {
    if (new RegExp(`(?:let|const|var|function|class)\\s+${v}\\b`).test(text)) {
      declared.add(v);
    }
  });

  allVars.forEach(v => {
    if (declared.has(v)) return;
    const regex = new RegExp(`(?<!\\.)\\b${v}\\b`, 'g');
    text = text.replace(regex, `ctx.${v}`);
  });

  const out = `(function init${name}(global) {
  "use strict";
  const Core = global.AISQCore;
  const ctx = global.AISQContext;
  
${text}

  Object.assign(ctx, {
${Array.from(declared).map(v => `    ${v}`).join(',\n')}
  });
})(typeof globalThis !== "undefined" ? globalThis : this);`;

  fs.writeFileSync(`src/${name === 'AISQUI' ? 'ui-tabs' : name === 'AISQRunner' ? 'runner' : 'host-bridge'}.js`, out);
}
console.log('Modules created');
