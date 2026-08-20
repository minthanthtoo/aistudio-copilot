(function initAISQRunnerLease(global) {
  "use strict";
  const Core = global.AISQCore;
  const ctx = global.AISQContext;

  function leaseExpired() {
    const stamp = Date.parse(ctx.state.runner.leaseUpdatedAt || "") || 0;
    return !ctx.state.runner.ownerTabId || ctx.state.runner.ownerTabId === ctx.tabId || Date.now() - stamp > 1500;
  }

  function canRun() {
    return !ctx.runnerOwnedByOtherTab && (ctx.leaseToken || leaseExpired() || ctx.state.runner.ownerTabId === ctx.tabId);
  }

  function claimLocalLease() {
    if (!canRun()) {
      ctx.runnerOwnedByOtherTab = true;
      return false;
    }
    ctx.state.runner.ownerTabId = ctx.tabId;
    ctx.state.runner.leaseUpdatedAt = Core.nowISO();
    ctx.runnerOwnedByOtherTab = false;
    return true;
  }

  function sendRuntimeMessage(message, timeoutMs = 5000) {
    if (!chrome.runtime?.sendMessage) return Promise.resolve(null);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(value || null);
      };
      const timeout = setTimeout(() => finish({ ok: false, error: "timeout" }), timeoutMs);
      try {
        const promise = chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            finish({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          finish(response);
        });
        if (promise && typeof promise.then === "function") promise.then(finish, (err) => finish({ ok: false, error: err.message }));
      } catch (err) {
        finish({ ok: false, error: err.message });
      }
    });
  }

  async function acquireRunnerLease() {
    if (!chrome.runtime?.sendMessage) {
      const acquired = claimLocalLease();
      if (acquired) ctx.leaseToken = `local-${ctx.tabId}`;
      return acquired;
    }
    const response = await sendRuntimeMessage({ type: "AISQ_LEASE_ACQUIRE", key: ctx.currentPageKey(), leaseMs: 20000 });
    if (!response?.ok) {
      if (response && response.error && (response.error.includes("Extension context invalidated") || response.error.includes("message port closed"))) {
        ctx.state.runner.lastError = "Extension was reloaded. Please refresh this page to continue.";
        ctx.state.runner.enabled = false;
        Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.PAUSED });
        ctx.requestRender();
      }
      ctx.runnerOwnedByOtherTab = true;
      ctx.state.runner.ownerTabId = response?.ownerTabId !== undefined && response?.ownerTabId !== null ? String(response.ownerTabId) : ctx.state.runner.ownerTabId;
      return false;
    }
    ctx.leaseToken = response.token;
    ctx.lastLeaseHeartbeatAt = Date.now();
    ctx.state.runner.ownerTabId = ctx.tabId;
    ctx.state.runner.leaseUpdatedAt = Core.nowISO();
    ctx.runnerOwnedByOtherTab = false;
    return true;
  }

  async function heartbeatRunnerLease() {
    if (!chrome.runtime?.sendMessage) {
      ctx.state.runner.leaseUpdatedAt = Core.nowISO();
      return true;
    }
    if (!ctx.leaseToken) return acquireRunnerLease();
    if (Date.now() - ctx.lastLeaseHeartbeatAt < 5000) return true;
    const response = await sendRuntimeMessage({ type: "AISQ_LEASE_HEARTBEAT", token: ctx.leaseToken, key: ctx.currentPageKey(), leaseMs: 20000 });
    if (!response?.ok) {
      ctx.leaseToken = null;
      ctx.runnerOwnedByOtherTab = true;
      ctx.state.runner.enabled = false;
      Core.commitTransition(ctx.state, Core.EVENTS.TRANSITION, { phase: PHASES.PAUSED });
      ctx.state.runner.ownerTabId = response?.ownerTabId !== undefined && response?.ownerTabId !== null ? String(response.ownerTabId) : null;
      ctx.state.runner.leaseUpdatedAt = null;
      
      if (response && response.error && (response.error.includes("Extension context invalidated") || response.error.includes("message port closed"))) {
        ctx.state.runner.lastError = "Extension was reloaded. Please refresh this page to continue.";
      } else {
        ctx.state.runner.lastError = `Runner lease was lost to another AI Studio tab; execution paused before the next action. (Debug: ${JSON.stringify(response)})`;
      }
      
      ctx.addHistory("lease_lost", ctx.state.runner.lastError);
      ctx.touchState();
      ctx.scheduleSave();
      ctx.requestRender();
      return false;
    }
    ctx.lastLeaseHeartbeatAt = Date.now();
    ctx.state.runner.leaseUpdatedAt = Core.nowISO();
    return true;
  }

  function releaseRunnerLease() {
    const token = ctx.leaseToken;
    ctx.leaseToken = null;
    ctx.lastLeaseHeartbeatAt = 0;
    ctx.runnerOwnedByOtherTab = false;
    if (chrome.runtime?.sendMessage && token) void sendRuntimeMessage({ type: "AISQ_LEASE_RELEASE", token, key: ctx.currentPageKey() }, 800);
  }


  Object.assign(ctx, { leaseExpired, canRun, claimLocalLease, sendRuntimeMessage, acquireRunnerLease, heartbeatRunnerLease, releaseRunnerLease });
})(typeof globalThis !== "undefined" ? globalThis : this);
