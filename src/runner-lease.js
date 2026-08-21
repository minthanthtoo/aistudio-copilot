(function initAISQRunnerLease(global) {
  "use strict";
  const Core = global.AISQCore;
  const ctx = global.AISQContext;
  const PHASES = Core.PHASES;

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

  async function acquireRunnerLease(key = ctx.currentPageKey()) {
    const targetKey = String(key || "root");
    if (!chrome.runtime?.sendMessage) {
      const acquired = claimLocalLease();
      if (acquired) {
        ctx.leaseToken = `local-${ctx.tabId}`;
        ctx.leaseKey = targetKey;
      }
      return acquired;
    }
    const response = await sendRuntimeMessage({ type: "AISQ_LEASE_ACQUIRE", key: targetKey, leaseMs: 20000 });
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
    ctx.leaseKey = targetKey;
    ctx.lastLeaseHeartbeatAt = Date.now();
    ctx.state.runner.ownerTabId = ctx.tabId;
    ctx.state.runner.leaseUpdatedAt = Core.nowISO();
    ctx.runnerOwnedByOtherTab = false;
    return true;
  }

  async function moveRunnerLease(key) {
    const targetKey = String(key || "root");
    if (!ctx.leaseToken) return acquireRunnerLease(targetKey);
    if (!ctx.leaseKey || ctx.leaseKey === targetKey) {
      ctx.leaseKey = targetKey;
      return true;
    }
    if (!chrome.runtime?.sendMessage) {
      ctx.leaseKey = targetKey;
      ctx.state.runner.leaseUpdatedAt = Core.nowISO();
      return true;
    }
    const response = await sendRuntimeMessage({
      type: "AISQ_LEASE_MOVE",
      fromKey: ctx.leaseKey,
      toKey: targetKey,
      token: ctx.leaseToken,
      leaseMs: 20000
    });
    if (!response?.ok) {
      ctx.runnerOwnedByOtherTab = true;
      ctx.state.runner.ownerTabId = response?.ownerTabId !== undefined && response?.ownerTabId !== null ? String(response.ownerTabId) : ctx.state.runner.ownerTabId;
      return false;
    }
    ctx.leaseToken = response.token;
    ctx.leaseKey = targetKey;
    ctx.lastLeaseHeartbeatAt = Date.now();
    ctx.state.runner.leaseUpdatedAt = Core.nowISO();
    ctx.runnerOwnedByOtherTab = false;
    return true;
  }

  async function heartbeatRunnerLease() {
    if (!chrome.runtime?.sendMessage) {
      ctx.leaseKey = ctx.leaseKey || ctx.currentPageKey();
      ctx.state.runner.leaseUpdatedAt = Core.nowISO();
      return true;
    }
    if (!ctx.leaseToken) return acquireRunnerLease();
    if (Date.now() - ctx.lastLeaseHeartbeatAt < 5000) return true;
    const response = await sendRuntimeMessage({ type: "AISQ_LEASE_HEARTBEAT", token: ctx.leaseToken, key: ctx.leaseKey || ctx.currentPageKey(), leaseMs: 20000 });
    if (!response?.ok) {
      ctx.leaseToken = null;
      ctx.leaseKey = null;
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
    const key = ctx.leaseKey;
    ctx.leaseToken = null;
    ctx.leaseKey = null;
    ctx.lastLeaseHeartbeatAt = 0;
    ctx.runnerOwnedByOtherTab = false;
    if (chrome.runtime?.sendMessage && token && key) void sendRuntimeMessage({ type: "AISQ_LEASE_RELEASE", token, key }, 800);
  }


  Object.assign(ctx, { leaseExpired, canRun, claimLocalLease, sendRuntimeMessage, acquireRunnerLease, moveRunnerLease, heartbeatRunnerLease, releaseRunnerLease });
})(typeof globalThis !== "undefined" ? globalThis : this);
