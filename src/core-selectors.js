(function initAISQCoreSelectors(global) {
  "use strict";
  const Core = global.AISQCore;
  const { ensureStackOrder, PHASES, PROMPT_STATUSES } = Core;

  function getAllProjects(state) {
    return Object.entries(state?.projects || {}).map(([key, project]) => ({ key, ...project }));
  }

  function getChainById(state, id) {
    return state?.chains?.find((chain) => chain.id === id) || null;
  }

  function getSelectedChain(state) {
    return getChainById(state, state?.selectedChainId) || null;
  }

  function getActiveQueue(state) {
    return getSelectedChain(state);
  }

  function findChainForPrompt(state, promptId) {
    return state?.chains?.find((chain) => chain.prompts.some((prompt) => prompt.id === promptId)) || null;
  }

  function getRunnerChain(state) {
    return getChainById(state, state?.runner?.activeChainId) || null;
  }

  function getRunnerPrompt(state) {
    const chain = getRunnerChain(state);
    return chain?.prompts.find((prompt) => prompt.id === state.runner.pendingPromptId) || null;
  }

  function nextQueuedPrompt(chain) {
    if (!chain) return null;
    const index = chain.prompts.findIndex((prompt) => prompt.status === "queued" || prompt.status === "error");
    if (index < 0) return null;
    chain.cursor = index;
    return chain.prompts[index];
  }

  function chainCounts(chain) {
    const counts = { total: 0, queued: 0, pending: 0, complete: 0, error: 0, skipped: 0 };
    if (!chain) return counts;
    counts.total = chain.prompts.length;
    for (const prompt of chain.prompts) {
      const key = PROMPT_STATUSES.includes(prompt.status) ? prompt.status : "queued";
      counts[key] += 1;
    }
    return counts;
  }

  const queueCounts = chainCounts;

  function chainStatus(state, chain) {
    if (!chain) return "empty";
    if (state?.runner?.activeChainId === chain.id && state.runner.enabled) return "running";
    const counts = chainCounts(chain);
    if (!counts.total) return "empty";
    if (counts.error) return "error";
    if (counts.pending) return "pending";
    if (counts.queued) return counts.complete || counts.skipped ? "partial" : "queued";
    return "complete";
  }

  function stackCounts(state) {
    const counts = { chains: 0, prompts: 0, queued: 0, pending: 0, complete: 0, error: 0, skipped: 0 };
    for (const id of state?.stackOrder || []) {
      const chain = getChainById(state, id);
      if (!chain) continue;
      counts.chains += 1;
      const chainCount = chainCounts(chain);
      counts.prompts += chainCount.total;
      for (const key of ["queued", "pending", "complete", "error", "skipped"]) counts[key] += chainCount[key];
    }
    return counts;
  }

  function nextStackTarget(state, options = {}) {
    const order = ensureStackOrder(state);
    const selectedOnly = !!options.selectedOnly;
    if (selectedOnly) {
      const selected = getChainById(state, options.startChainId || state.selectedChainId);
      const prompt = nextQueuedPrompt(selected);
      return selected && prompt ? { chain: selected, prompt, chainIndex: order.indexOf(selected.id), promptIndex: selected.prompts.indexOf(prompt) } : null;
    }
    const startId = options.startChainId || state.runner?.activeChainId || (selectedOnly ? state.selectedChainId : null);
    let startIndex = startId ? order.indexOf(startId) : -1;
    if (startIndex < 0) startIndex = -1;
    const end = selectedOnly ? Math.min(startIndex + 1, order.length) : order.length;
    for (let index = startIndex < 0 ? 0 : startIndex; index < end; index += 1) {
      const chain = getChainById(state, order[index]);
      const prompt = nextQueuedPrompt(chain);
      if (chain && prompt) return { chain, prompt, chainIndex: index, promptIndex: chain.prompts.indexOf(prompt) };
    }
    return null;
  }

  function nextChainTarget(state, currentChainId) {
    return nextStackTarget(state, { startChainId: currentChainId });
  }

  function promptIsLocked(state, promptId) {
    return state?.runner?.pendingPromptId === promptId || state?.chains?.some((chain) => chain.prompts.some((prompt) => prompt.id === promptId && prompt.status === "pending"));
  }

  function chainIsLocked(state, chainId) {
    return state?.runner?.activeChainId === chainId && !!state.runner?.pendingPromptId;
  }


  Object.assign(Core, { getAllProjects, getChainById, getSelectedChain, getActiveQueue, getRunnerChain, getRunnerPrompt, findChainForPrompt, nextQueuedPrompt, chainCounts, queueCounts, chainStatus, stackCounts, nextStackTarget, nextChainTarget, promptIsLocked, chainIsLocked });
})(typeof globalThis !== "undefined" ? globalThis : this);
