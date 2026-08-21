(function initAISQHostDiagnostics(global) {
  "use strict";
  const Core = global.AISQCore;
  const ctx = global.AISQContext;
  const PHASES = Core.PHASES;

  async function downloadZip() {
    try {
      const directBtn = ctx.visibleAll('button[aria-label="Download app"][iconname="download"], button[aria-label="Download app"]')[0];
      if (directBtn) {
        directBtn.click();
        ctx.addHistory("download", "Requested direct app download");
        return;
      }
    } catch {}
    if (ctx.exportStep) return;
    ctx.exportStep = "Opening Code view";
    ctx.requestRender();
    try {
      const code = ctx.exactButton("Code");
      if (code) code.click();
      ctx.exportStep = "Opening export menu";
      ctx.requestRender();
      const exportButton = await ctx.waitForElement(() => ctx.visibleAll('button[aria-label="Export options"]')[0], 3000);
      if (!exportButton) throw new Error("Export options is unavailable; open an app editor first");
      const findZipItem = () => ctx.visibleAll('[role="menuitem"], button').find((node) => /^Download as \.zip file\b/i.test(ctx.textOf(node))) || null;
      let zip = findZipItem();
      if (!zip && exportButton.getAttribute("aria-expanded") !== "true") exportButton.click();
      zip = zip || await ctx.waitForElement(findZipItem, 1800);
      if (!zip) {
        if (exportButton.getAttribute("aria-expanded") === "true") {
          exportButton.click();
          await ctx.sleep(150);
        }
        exportButton.click();
        zip = await ctx.waitForElement(findZipItem, 2200);
      }
      if (!zip) throw new Error("Download as .zip file menu item was not found");
      ctx.exportStep = "Choosing ZIP archive";
      zip.click();
      ctx.addHistory("download", "Requested app ZIP download");
      ctx.state.runner.lastError = null;
    } catch (error) {
      ctx.state.runner.lastError = error.message;
      ctx.addHistory("download_error", error.message);
    } finally {
      ctx.exportStep = null;
      ctx.touchState();
      ctx.scheduleSave();
      ctx.requestRender();
    }
  }

  function createDiagnosticSnapshot() {
    const order = new Map(ctx.state.stackOrder.map((id, index) => [id, index]));
    const chainRefs = new Map(ctx.state.chains.map((chain, index) => [chain.id, `chain-${index + 1}`]));
    let pendingRef = null;
    const chains = ctx.state.chains.map((chain, chainIndex) => ({
      ref: chainRefs.get(chain.id),
      stackPosition: order.has(chain.id) ? order.get(chain.id) + 1 : null,
      splitStrategy: chain.source.splitStrategy,
      createdAt: chain.createdAt,
      updatedAt: chain.updatedAt,
      counts: Core.chainCounts(chain),
      prompts: chain.prompts.map((prompt, promptIndex) => {
        const ref = `${chainRefs.get(chain.id)}.prompt-${promptIndex + 1}`;
        if (prompt.id === ctx.state.runner.pendingPromptId) pendingRef = ref;
        return {
          ref,
          status: prompt.status,
          attempts: Number(prompt.attempts || 0),
          textLength: prompt.text.length,
          submittedAt: prompt.submittedAt,
          completedAt: prompt.completedAt,
          hasError: !!prompt.error
        };
      })
    }));
    const host = ctx.scanHost();
    return {
      format: "aisq-redacted-diagnostics-v1",
      exportedAt: Core.nowISO(),
      extensionVersion: ctx.EXTENSION_VERSION,
      schemaVersion: ctx.state.schemaVersion,
      revision: ctx.state.revision,
      runner: {
        phase: ctx.state.runner.phase,
        enabled: ctx.state.runner.enabled,
        scope: ctx.state.runner.scope,
        scopeChainRef: chainRefs.get(ctx.state.runner.scopeChainId) || null,
        activeChainRef: chainRefs.get(ctx.state.runner.activeChainId) || null,
        pendingPromptRef: pendingRef,
        baselineTurnCount: ctx.state.runner.baselineTurnCount,
        retryCount: ctx.state.runner.retryCount,
        hasLastError: !!ctx.state.runner.lastError,
        revision: ctx.state.runner.revision,
        updatedAt: ctx.state.runner.updatedAt
      },
      settings: ctx.clone(ctx.state.settings),
      host: {
        mode: host.mode,
        state: host.state,
        busy: host.busy,
        failed: host.failed,
        success: host.success,
        blocked: host.blocked,
        submitReady: host.submitReady,
        retryVisible: host.retryVisible,
        turnCount: host.turnCount
      },
      chains,
      history: ctx.state.history.map((entry) => ({ at: entry.at, kind: entry.kind })),
      eventLog: {
        totalEntries: (ctx.state.eventLog || []).length,
        lastEvents: (ctx.state.eventLog || []).slice(-20).map(e => ({
          event: e.event,
          at: e.at,
          promptId: e.payload?.promptId || null,
          reason: e.payload?.reason || e.payload?.message || null,
          evidenceVerdict: e.payload?.evidence?.verdict || null
        })),
        circuitBreaker: typeof AISQEvidence !== "undefined" ? AISQEvidence.shouldCircuitBreak(ctx.state.eventLog) : null
      }
    };
  }

  function downloadDiagnostics() {
    try {
      const snapshot = ctx.createDiagnosticSnapshot();
      const blob = new Blob([`${JSON.stringify(snapshot, null, 2)}\n`], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ai-studio-queue-pilot-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      anchor.hidden = true;
      ctx.shadow.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      ctx.addHistory("diagnostics", "Downloaded redacted diagnostics");
      ctx.state.runner.lastError = null;
      ctx.touchState();
      ctx.scheduleSave();
    } catch (error) {
      ctx.mutate(() => {
        ctx.state.runner.lastError = `Could not export diagnostics: ${error.message}`;
        ctx.addHistory("diagnostics_error", ctx.state.runner.lastError);
      });
    }
  }

  class AIStudioAdapter {
    constructor() {}
    perceive() { return ctx.scanHost(); }
    readOutput() {
      return ctx.readLastTurnContent() || { text: null, type: 'unknown' };
    }
    actuate(action, payload) {
      if (action === 'SUBMIT') {
        const host = ctx.scanHost();
        if (host.textarea) ctx.setNativeValue(host.textarea, payload);
        if (host.submit) ctx.robustClick(host.submit);
        return true;
      }
      return false;
    }
  }
  globalThis.AISQHostAdapter = new AIStudioAdapter();


  Object.assign(ctx, { downloadZip, createDiagnosticSnapshot, downloadDiagnostics });
})(typeof globalThis !== "undefined" ? globalThis : this);
