(function initEvidence(global) {
  "use strict";

  const VERDICTS = Object.freeze({
    PASS: 'PASS', FAIL: 'FAIL', UNCERTAIN: 'UNCERTAIN'
  });

  function collectEvidence(hostSnapshot, runner, tier = 0) {
    const ev = {
      id: global.AISQCore.uid('ev'),
      promptId: runner.pendingPromptId,
      chainId: runner.activeChainId,
      tier,
      at: global.AISQCore.nowISO(),
      verdict: VERDICTS.UNCERTAIN,
      confidence: 0,
      signals: {},
      details: [],
    };

    const turnDelta = hostSnapshot.turnCount - (runner.baselineTurnCount || 0);
    ev.signals = {
      turnDelta,
      hasError: !!hostSnapshot.failed,
      errorText: hostSnapshot.errorText || null,
      headerText: hostSnapshot.lastHeader || null,
      settleVerified: hostSnapshot.success,
      isRunning: hostSnapshot.busy,
    };

    if (hostSnapshot.failed) {
      ev.verdict = VERDICTS.FAIL;
      ev.confidence = 0.95;
      ev.details.push(`Error: ${(hostSnapshot.errorText || hostSnapshot.lastHeader || 'unknown').slice(0, 200)}`);
      return Object.freeze(ev);
    }

    if (hostSnapshot.busy && turnDelta < 1) {
      ev.verdict = VERDICTS.UNCERTAIN;
      ev.confidence = 0.1;
      ev.details.push('Host still busy, no new turn');
      return Object.freeze(ev);
    }

    if (turnDelta < 1 && !hostSnapshot.busy && !hostSnapshot.failed) {
      ev.verdict = VERDICTS.FAIL;
      ev.confidence = 0.80;
      ev.details.push('No turn increment detected — possible silent failure');
      return Object.freeze(ev);
    }

    if (turnDelta >= 1 && hostSnapshot.success && !hostSnapshot.failed) {
      ev.verdict = VERDICTS.PASS;
      ev.confidence = 0.88;
      ev.details.push(`Turn completed (delta=${turnDelta}), settled, no error`);
    }

    if (tier >= 1 && ev.verdict === VERDICTS.PASS) {
      const fast = /Ran for\s+(\d+)s/i.exec(hostSnapshot.lastHeader || '');
      if (fast && parseInt(fast[1]) < 2) {
        ev.confidence -= 0.15;
        ev.details.push('Suspiciously fast completion (<2s)');
      }

      if (hostSnapshot.lastHeader && hostSnapshot.lastHeader.length < 10) {
        ev.confidence -= 0.05;
        ev.details.push('Very short header text');
      }
    }

    return Object.freeze(ev);
  }

  function shouldCircuitBreak(eventLog) {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const recentFails = (eventLog || []).filter(e =>
      (e.event === 'TURN_FAILED' || e.event === 'TURN_TIMED_OUT') &&
      Date.parse(e.at) > fiveMinAgo
    );
    if (recentFails.length >= 5) {
      return { break: true, reason: `${recentFails.length} failures in 5 minutes` };
    }

    const last3 = (eventLog || []).slice(-3);
    if (last3.length === 3 && last3.every(e =>
      e.event === 'RETRY_EXECUTED' &&
      e.payload?.promptId === last3[0]?.payload?.promptId
    )) {
      return { break: true, reason: '3 consecutive retries on same prompt' };
    }

    return { break: false };
  }

  const api = {
    VERDICTS,
    collectEvidence,
    shouldCircuitBreak,
  };

  global.AISQEvidence = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : this);
