(function initGoalManager(global) {
  "use strict";

  const JSON_FALLBACKS = [
    (text) => text.replace(/```json\n([\s\S]*?)```/g, '$1'),
    (text) => {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start >= 0 && end >= 0 && end > start) {
        return text.substring(start, end + 1);
      }
      return text;
    }
  ];

  function safeParseJSON(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      for (const fallback of JSON_FALLBACKS) {
        try {
          return JSON.parse(fallback(text));
        } catch (e2) {}
      }
      throw new Error("Could not parse JSON response even with fallbacks");
    }
  }

  function validatePlan(plan) {
    if (!plan || typeof plan !== 'object') throw new Error("Plan must be an object");
    if (!Array.isArray(plan.steps)) throw new Error("Plan must have a 'steps' array");
    if (plan.steps.length > 20) throw new Error("Plan exceeds 20 step safety cap");
    return plan;
  }

  function createGoal(description, initialPlan) {
    return {
      id: global.AISQCore.uid('goal'),
      description,
      status: 'active',
      plan: validatePlan(initialPlan),
      createdAt: global.AISQCore.nowISO(),
      updatedAt: global.AISQCore.nowISO(),
    };
  }

  function evaluateAdaptiveHook(ctx, promptId, outputContent) {
    if (!global.AISQAuthority.authorize(null, 'MODIFY_GOALS')) return null;
    
    // Check if the output contains a <tool_call> or specific JSON block that signals a plan update
    if (outputContent && outputContent.type === 'mixed') {
      const planBlock = outputContent.blocks.find(b => b.type === 'code' && b.text.includes('"steps"'));
      if (planBlock) {
        try {
          const plan = validatePlan(safeParseJSON(planBlock.text));
          return { action: 'update_plan', plan };
        } catch (e) {
          return { action: 'plan_error', error: e.message };
        }
      }
    }
    return null;
  }

  function generateSelfHealingPrompt(evidence, errorText) {
    return `The previous execution failed with the following error:\n${errorText}\n\nEvidence of failure:\n${JSON.stringify(evidence.details)}\n\nPlease provide a new plan to recover from this state.`;
  }

  function handleSelfHealing(ctx, evidence, errorText) {
    if (!global.AISQAuthority.authorize(null, 'INJECT_REPAIR')) return false;

    // Check circuit breaker first
    const cb = global.AISQEvidence.shouldCircuitBreak(ctx.state.eventLog);
    if (cb.break) {
      global.AISQCore.commitTransition(ctx.state, global.AISQCore.EVENTS.CIRCUIT_BROKEN, { reason: 'Circuit broken during self-heal attempt: ' + cb.reason });
      return false;
    }

    const repairPromptText = generateSelfHealingPrompt(evidence, errorText);
    
    // Inject repair chain
    const repairChain = global.AISQCore.normalizeChain({
      name: 'Self-Healing Repair',
      prompts: [{ text: repairPromptText }]
    });
    
    ctx.state.chains.push(repairChain);
    ctx.state.stackOrder.splice(0, 0, repairChain.id); // Push to front
    global.AISQCore.commitTransition(ctx.state, global.AISQCore.EVENTS.REPAIR_INJECTED, { chainId: repairChain.id, reason: evidence.details.join(', ') });
    
    return true; // Indicates we handled it
  }

  const api = {
    safeParseJSON,
    validatePlan,
    createGoal,
    evaluateAdaptiveHook,
    handleSelfHealing
  };

  global.AISQGoal = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : this);
