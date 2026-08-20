const fs = require('fs');
const lines = fs.readFileSync('src/content.js', 'utf8').split('\n');

const hostLines = [
  ...lines.slice(42, 279), // visible to scanHostCached
  ...lines.slice(1090, 1223) // downloadZip to downloadDiagnostics
];

const runnerLines = [
  ...lines.slice(437, 1090) // acquireRunnerLease to resetCurrentChain
];

const uiLines = [
  ...lines.slice(1224, 2548) // el to mount
];

const vars = ['state', 'mutate', 'command', 'requestRender', 'shadow', 'panel', 'statusLine', 'tabId', 'leaseToken', 'runnerOwnedByOtherTab', 'clickedOptInControls', 'persistedRevision', 'rootHost', 'tickBusy', 'saveTimer', 'saveQueue', 'tickIntervalId', 'renderQueued', 'lastHostSignature', 'exportStep', 'lastLeaseHeartbeatAt', 'addHistory', 'enqueueSave', 'touchState', 'scheduleSave', 'startRunner', 'pauseRunner', 'resumeRunner', 'recoverPendingHere', 'skipPrompt', 'downloadZip', 'createDiagnosticSnapshot', 'downloadDiagnostics', 'el', 'button', 'field', 'importText', 'visibleAll', 'exactButton', 'waitForElement', 'textOf', 'scanHost', 'scanHostCached', 'setNativeValue', 'robustClick', 'clickOptInControls', 'renderCountdowns', 'runnerChain', 'runnerPrompt', 'selectedChain'];

function check(linesArr, name) {
  let text = linesArr.join('\n');
  vars.forEach(v => {
    if (new RegExp(`(?:let|const|var|function|class)\\s+${v}\\b`).test(text)) {
      console.log(`[${name}] DECLARATION FOUND: ${v}`);
    }
  });
}

check(hostLines, 'host');
check(runnerLines, 'runner');
check(uiLines, 'ui');
