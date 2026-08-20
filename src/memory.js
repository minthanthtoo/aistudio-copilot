(function initMemory(global) {
  "use strict";

  function updateInsights(state, promptId, outputText) {
    if (!state.memory) {
      state.memory = { insights: [], learnedPreferences: [] };
    }
    
    // Very naive extraction: just looking for "I prefer" or "Use" as a mock
    if (outputText.includes("I prefer") || outputText.includes("Always use")) {
      const insight = outputText.substring(Math.max(0, outputText.indexOf("I prefer") - 10), outputText.indexOf("I prefer") + 50);
      state.memory.learnedPreferences.push({
        id: global.AISQCore.uid('pref'),
        text: insight + '...',
        at: global.AISQCore.nowISO(),
        sourcePromptId: promptId
      });
      global.AISQCore.commitTransition(state, global.AISQCore.EVENTS.MEMORY_UPDATED, { type: 'preference', text: insight });
    }
  }

  const api = {
    updateInsights
  };

  global.AISQMemory = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : this);
