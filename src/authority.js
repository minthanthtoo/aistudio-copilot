(function initAuthority(global) {
  "use strict";

  const LEVELS = Object.freeze({
    L1: { level: 1, name: 'L1: Copilot', description: 'Requires manual start. Stops on any failure. Never self-heals.', permissions: ['EXECUTE_MANUAL', 'HALT_ON_ERROR'] },
    L2: { level: 2, name: 'L2: Agent', description: 'Runs automatically. Can retry basic failures. Cannot self-heal.', permissions: ['EXECUTE_AUTO', 'RETRY_BASIC'] },
    L3: { level: 3, name: 'L3: Resilient', description: 'Runs automatically. Can modify chains to recover. Strict token budgets.', permissions: ['EXECUTE_AUTO', 'RETRY_BASIC', 'INJECT_REPAIR'] },
    L4: { level: 4, name: 'L4: Autonomous', description: 'Complete authority to achieve goals. Can rewrite its own plans.', permissions: ['EXECUTE_AUTO', 'RETRY_BASIC', 'INJECT_REPAIR', 'MODIFY_GOALS', 'REWRITE_CHAINS'] },
  });

  function inferLevel(settings) {
    if (!settings.autoRun) return LEVELS.L1;
    if (settings.failurePolicy === 'pause') return LEVELS.L2;
    return LEVELS.L3; // Currently highest mapped via legacy settings
  }

  function authorize(token, action) {
    // In Phase 3, we just check against the inferred level from settings
    const currentLevel = inferLevel(global.AISQCore.defaultSettings()); // Will use actual state in runner
    return currentLevel.permissions.includes(action);
  }

  function createToken(owner, reason, budgetMs) {
    return {
      id: global.AISQCore.uid('tok'),
      owner,
      reason,
      grantedAt: Date.now(),
      expiresAt: Date.now() + budgetMs,
      isValid: () => Date.now() < this.expiresAt
    };
  }

  const api = {
    LEVELS,
    inferLevel,
    authorize,
    createToken,
  };

  global.AISQAuthority = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : this);
