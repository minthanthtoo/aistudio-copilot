(function initAISQContentState(global) {
  "use strict";
  const Core = global.AISQCore;
  const ctx = global.AISQContext;
  const PHASES = Core.PHASES;

  function selectedChain() { return Core.getSelectedChain(ctx.state); }
  function runnerChain() { return Core.getRunnerChain(ctx.state); }
  function runnerPrompt() { return Core.getRunnerPrompt(ctx.state); }



  /** True if the bound key is a generic apps-list page and the current key is a specific app under it. */

  let lastSeenPageKey = Core.getCurrentPageKey();
  
  function checkUrlUpgrade() {
    const current = Core.getCurrentPageKey();
    if (lastSeenPageKey !== current) {
      if ((lastSeenPageKey === "app:home" && current.startsWith("app:")) || (lastSeenPageKey === "prompt:home" && current.startsWith("prompt:"))) {
        // Upgrade detected! Migrate the projects and runners map!
        mutate(() => {
          if (ctx.state.runners && ctx.state.runners[lastSeenPageKey]) {
            ctx.state.runners[current] = ctx.state.runners[lastSeenPageKey];
            delete ctx.state.runners[lastSeenPageKey];
          }
          if (ctx.state.projects && ctx.state.projects[lastSeenPageKey]) {
            ctx.state.projects[current] = ctx.state.projects[lastSeenPageKey];
            delete ctx.state.projects[lastSeenPageKey];
          }
        });
      }
      lastSeenPageKey = current;
    }
  }

  function currentPageKey() {
    return Core.getCurrentPageKey();
  }

  function isAppsListUpgrade(boundKey, currentKey) {
    return (boundKey === "app:home" && currentKey.startsWith("app:") && currentKey !== "app:home") ||
           (boundKey === "prompt:home" && currentKey.startsWith("prompt:") && currentKey !== "prompt:home");
  }


  function pageMatchesBinding() {
    if (!ctx.state.runner.boundPageKey) return true;
    const current = currentPageKey();
    return ctx.state.runner.boundPageKey === current || isAppsListUpgrade(ctx.state.runner.boundPageKey, current);
  }

  function addHistory(kind, message, data = null) {
    ctx.state.history.push({ at: Core.nowISO(), kind, message, data });
    if (ctx.state.history.length > 350) ctx.state.history = ctx.state.history.slice(-300);
  }

  function touchState() {
    ctx.state.revision = Number(ctx.state.revision || 0) + 1;
    ctx.state.updatedAt = Core.nowISO();
    ctx.state.runner.updatedAt = ctx.state.updatedAt;
  }

  function compareStateVersion(left, right) {
    const revisionDifference = Number(left?.revision || 0) - Number(right?.revision || 0);
    if (revisionDifference) return revisionDifference;
    return String(left?.updatedAt || "").localeCompare(String(right?.updatedAt || ""));
  }

  function acceptStoredState(raw) {
    const incoming = Core.migrateState(raw);
    if (compareStateVersion(incoming, ctx.state) <= 0) return false;
    ctx.state = incoming;
    ctx.persistedRevision = Number(incoming.revision || 0);
    ctx.runnerOwnedByOtherTab = !!(ctx.state.runner.enabled && ctx.state.runner.ownerTabId && ctx.state.runner.ownerTabId !== ctx.tabId);
    if (ctx.state.runner.ownerTabId !== ctx.tabId) ctx.leaseToken = null;
    requestRender();
    return true;
  }

  function enqueueSave() {
    const operation = async () => {
      Core.syncLegacyAliases(ctx.state);
      const current = await ctx.adapter.get(ctx.STORAGE_KEY);
      const stored = current ? Core.migrateState(current) : null;
      if (stored && Number(stored.revision || 0) > ctx.persistedRevision) {
        if (compareStateVersion(stored, ctx.state) > 0) acceptStoredState(stored);
        else {
          ctx.state = stored;
          ctx.persistedRevision = Number(stored.revision || 0);
          ctx.state.runner.lastError = "A newer queue change from another tab was kept; repeat your last edit on the synchronized ctx.state";
          ctx.runnerOwnedByOtherTab = !!(ctx.state.runner.enabled && ctx.state.runner.ownerTabId && ctx.state.runner.ownerTabId !== ctx.tabId);
          requestRender();
        }
        return false;
      }
      const snapshot = ctx.clone(ctx.state);
      delete snapshot.chains;
      delete snapshot.stackOrder;
      delete snapshot.selectedChainId;
      delete snapshot.runner; // Also delete runner proxy to avoid duplication
      await ctx.adapter.set(ctx.STORAGE_KEY, snapshot);
      if (!globalThis.__AISQ_LEGACY_WRITTEN__) {
        await ctx.adapter.set(ctx.LEGACY_STORAGE_KEY, snapshot);
        globalThis.__AISQ_LEGACY_WRITTEN__ = true;
      }
      ctx.persistedRevision = Number(snapshot.revision || 0);
      return true;
    };
    const result = ctx.saveQueue.then(operation, operation);
    ctx.saveQueue = result.catch(() => {});
    return result;
  }

  function scheduleSave() {
    clearTimeout(ctx.saveTimer);
    ctx.saveTimer = setTimeout(() => {
      void enqueueSave().catch(() => {});
    }, 80);
  }

  async function saveNow() {
    clearTimeout(ctx.saveTimer);
    return enqueueSave();
  }

  function mutate(mutator, render = true) {
    mutator(ctx.state);
    Core.syncLegacyAliases(ctx.state);
    touchState();
    scheduleSave();
    if (render) requestRender();
  }

  function command(type, payload = {}, options = {}) {
    const ownerOnlyMutation = (type === "SKIP_PROMPT" && (!payload.promptId || payload.promptId === ctx.state.runner.pendingPromptId)) ||
      (type === "SKIP_CHAIN" && (!payload.chainId || payload.chainId === ctx.state.runner.activeChainId));
    if (ownerOnlyMutation && ctx.state.runner.enabled && !ctx.leaseToken) {
      const error = "Only the owner tab can change the running prompt or chain";
      ctx.state.runner.lastError = error;
      touchState();
      scheduleSave();
      requestRender();
      return { ok: false, error };
    }
    const result = Core.applyCommand(ctx.state, { type, payload });
    if (!result.ok) {
      if (options.showError !== false) addHistory("command_rejected", result.error, { type, payload });
      if (options.showError !== false) {
        ctx.state.runner.lastError = result.error;
        touchState();
        scheduleSave();
        requestRender();
      }
      return result;
    }
    if (options.history) addHistory(options.history.kind, options.history.message, options.history.data || null);
    if (!ctx.state.runner.enabled && ctx.state.runner.phase === PHASES.PAUSED) ctx.releaseRunnerLease();
    touchState();
    scheduleSave();
    requestRender();
    return result;
  }


  let toastContainer;

  Object.assign(ctx, { selectedChain, runnerChain, runnerPrompt, checkUrlUpgrade, currentPageKey, isAppsListUpgrade, pageMatchesBinding, addHistory, touchState, compareStateVersion, acceptStoredState, enqueueSave, scheduleSave, saveNow, mutate, command });
})(typeof globalThis !== "undefined" ? globalThis : this);
