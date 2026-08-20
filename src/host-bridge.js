(function initAISQHost(global) {
  "use strict";
  const Core = global.AISQCore;
  const ctx = global.AISQContext;
  const ROOT_ID = "aisq-extension-root";
  
  function visible(node) {
    if (!(node instanceof Element)) return false;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
  }

  let deepQueryCache = new Map();
  let deepQueryLastSweep = Date.now();

  function deepQueryAll(selector, root = document) {
    const now = Date.now();
    if (now - deepQueryLastSweep > 1000) {
      deepQueryCache.clear();
      deepQueryLastSweep = now;
    }
    const rootKey = root === document ? 'doc' : (root.id || 'scoped');
    const key = `${selector}@${rootKey}`;
    const cached = deepQueryCache.get(key);
    if (cached && now - cached.time < 250) {
      // Filter out elements that were removed from the DOM since they were cached
      return cached.results.filter(el => el.isConnected);
    }

    const results = [];
    const seen = new Set();
    function crawl(node) {
      if (!node || seen.has(node)) return;
      seen.add(node);
      if (node.querySelectorAll) {
        try {
          const matches = node.querySelectorAll(selector);
          for (let i = 0; i < matches.length; i++) results.push(matches[i]);
        } catch {}
      }
      const children = node.children || [];
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.id === ROOT_ID || (ctx.rootHost && child === ctx.rootHost)) continue;
        if (child.shadowRoot) crawl(child.shadowRoot);
        crawl(child);
      }
    }
    crawl(root);
    deepQueryCache.set(key, { time: now, results });
    return results;
  }

  function visibleAll(selector, scope = document) {
    return deepQueryAll(selector, scope).filter(visible);
  }

  function exactButton(label, scope = document) {
    const suffix = new RegExp(`(?:^|\\s)${String(label).replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}$`, "i");
    return visibleAll("button", scope).find((button) => {
      const aria = String(button.getAttribute("aria-label") || "").trim();
      const title = String(button.getAttribute("title") || "").trim();
      return aria.toLowerCase() === String(label).toLowerCase() || title.toLowerCase() === String(label).toLowerCase() || suffix.test(ctx.textOf(button));
    }) || null;
  }

  function enabled(control) {
    return !!control && !control.disabled && control.getAttribute("aria-disabled") !== "true" && !control.classList.contains("disabled");
  }

  async function waitForElement(getter, timeoutMs = 2500, stepMs = 100) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const element = getter();
      if (element) return element;
      await ctx.sleep(stepMs);
    }
    return null;
  }

  function setNativeValue(control, value) {
    if (!control) return;
    const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) {
      control.value = value;
    } else {
      control.focus();
      setter.call(control, value);
    }
    const InputEventClass = globalThis.InputEvent || Event;
    try {
      control.dispatchEvent(new InputEventClass("beforeinput", { bubbles: true, cancelable: true, composed: true, inputType: "insertText", data: value }));
    } catch {}
    control.dispatchEvent(new InputEventClass("input", { bubbles: true, composed: true, inputType: "insertText", data: value }));
    control.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    control.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, composed: true, key: "End" }));
    control.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, composed: true, key: "End" }));
  }

  
  

  function stashText() {
    const ta = scanHostCached().textarea;
    if (!ta) return;
    const original = ta.value ?? "";
    if (!original.trim()) return;
    ctx.textStash = { original, selStart: ta.selectionStart, selEnd: ta.selectionEnd };
    setNativeValue(ta, "");
  }

  function restoreText() {
    if (!ctx.textStash) return;
    const ta = scanHostCached().textarea;
    if (!ta) return;
    setNativeValue(ta, ctx.textStash.original);
    try {
      ta.focus();
      ta.setSelectionRange(ctx.textStash.selStart ?? ctx.textStash.original.length, ctx.textStash.selEnd ?? ctx.textStash.original.length);
    } catch {}
    ctx.textStash = null;
  }

  function robustClick(btn) {
    if (!btn) return false;
    try { btn.scrollIntoView({ block: "center", inline: "center" }); btn.focus?.(); } catch {}
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const pe = (type) => new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: "mouse", isPrimary: true, clientX: x, clientY: y, button: 0, buttons: type === "pointerdown" ? 1 : 0 });
    const me = (type) => new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons: type === "mousedown" ? 1 : 0 });
    try {
      btn.dispatchEvent(pe("pointerover")); btn.dispatchEvent(me("mouseover"));
      btn.dispatchEvent(pe("pointerdown")); btn.dispatchEvent(me("mousedown"));
      btn.dispatchEvent(pe("pointerup")); btn.dispatchEvent(me("mouseup"));
      btn.dispatchEvent(me("click"));
      return true;
    } catch {
      try { btn.click(); return true; } catch { return false; }
    }
  }

  function findRetryButton(scope = document) {
    const callouts = visibleAll("ms-error-callout, ms-chat-turn-error", scope).reverse();
    for (const callout of callouts) {
      const retry = visibleAll("button", callout).find((button) => ctx.textOf(button).includes("Retry"));
      if (retry) return retry;
    }
    return null;
  }

  let cachedChatContainer = null;
  function getChatContainer() {
    if (cachedChatContainer && cachedChatContainer.isConnected) return cachedChatContainer;
    cachedChatContainer = document.querySelector('ms-code-assistant-chat') || null;
    return cachedChatContainer;
  }

  function readLastTurnContent() {
    const chat = getChatContainer();
    if (!chat) return null;
    const allTurns = Array.from(chat.querySelectorAll('.turn:not(.input)'));
    const turns = allTurns.filter(t => t.offsetParent !== null || visible(t));
    const lastTurn = turns.at(-1);
    if (!lastTurn) return null;

    const contentBlocks = [];
    const elements = deepQueryAll('.markdown-content > *, .code-block-wrapper, ms-file-chip', lastTurn);
    for (const el of elements) {
      if (!visible(el)) continue;
      if (el.matches('.code-block-wrapper')) {
        const code = ctx.textOf(el.querySelector('code'));
        if (code) contentBlocks.push({ type: 'code', text: code });
      } else if (el.matches('ms-file-chip')) {
        const file = ctx.textOf(el);
        if (file) contentBlocks.push({ type: 'file_edit', text: file });
      } else {
        const text = ctx.textOf(el);
        if (text) contentBlocks.push({ type: 'text', text });
      }
    }
    
    return {
      text: contentBlocks.map(b => b.text).join('\n\n'),
      type: 'mixed',
      blocks: contentBlocks
    };
  }

  function checkHostHealth() {
    let health = { ok: true, degradationLevel: 0, missing: [] };
    const scan = scanHost();
    if (!getChatContainer() && scan.mode === 'editor') {
      health.ok = false;
      health.degradationLevel = 2;
      health.missing.push('chat-container');
    }
    if (!scan.textarea) {
      health.ok = false;
      health.degradationLevel = Math.max(health.degradationLevel, 1);
      health.missing.push('textarea');
    }
    return health;
  }

  function scanHost() {
    const chat = getChatContainer();

    // ── Textarea ─────────────────────────────────────────────────────────────
    let editorTextarea = null;
    if (chat) {
      editorTextarea = Array.from(chat.querySelectorAll('textarea.cdk-textarea-autosize, textarea[placeholder*="Make changes"]'))
        .find(el => el.offsetParent !== null || visible(el)) || null;
    }
    const startTextarea = visibleAll('textarea[placeholder="Describe an app and let Gemini do the rest"]')[0] || null;
    const mode = editorTextarea ? "editor" : startTextarea ? "start" : "unsupported";
    const textarea = editorTextarea || startTextarea;

    // ── Send / Stop button ────────────────────────────────────────────────────
    let sendBtn = null;
    if (mode === "editor" && chat) {
      sendBtn = Array.from(chat.querySelectorAll('button.send-button, button[aria-label="Send"]'))
        .find(el => el.offsetParent !== null || visible(el)) || null;
    }

    // Thinking indicator text (must be visible)
    const thinkingNode = chat ? Array.from(chat.querySelectorAll('ms-thinking-indicator, .thinking-text'))
      .find(el => visible(el)) || null : null;
    const thinkingText = thinkingNode ? ctx.textOf(thinkingNode) : "";

    // "running" class on the send button is the most reliable busy signal.
    // We also explicitly look for a "Cancel generation" or "Stop generation" button
    const stopBtn = Array.from(chat ? chat.querySelectorAll('button[aria-label*="Stop"], button[aria-label*="Cancel generation"], button[mattooltip*="Stop"], button[mattooltip*="Cancel generation"]') : [])
      .find(el => el.offsetParent !== null || visible(el)) || null;

    const isRunning = !!(sendBtn?.classList.contains("running") ||
      stopBtn ||
      thinkingNode ||
      (chat ? Array.from(chat.querySelectorAll('ms-gradient-spinner')).some(el => visible(el)) : false));

    // When running: submit = null (can't submit again), stop = the running button.
    const stop = isRunning ? (stopBtn || sendBtn || deepQueryAll('button.send-button.running, button[aria-label*="Stop"], button[aria-label*="Cancel"]')[0] || null) : null;
    const submit = mode === "editor"
      ? (isRunning ? null : sendBtn)
      : mode === "start" ? visibleAll("button.build-button")[0] || exactButton("Build") : null;

    // ── Turns ─────────────────────────────────────────────────────────────────
    let turns = [];
    if (chat) {
      const allTurns = Array.from(chat.querySelectorAll('.turn:not(.input)'));
      // Only keep turns that are actually visible (some might be hidden templates)
      turns = allTurns.filter(t => t.offsetParent !== null || visible(t));
    }
    const lastTurn = turns.at(-1) || null;
    const lastHeader = ctx.textOf(lastTurn?.querySelector(".turn-header"));
    const retry = lastTurn ? findRetryButton(lastTurn) : null;
    const errorText = ctx.textOf(lastTurn?.querySelector("ms-error-callout, ms-chat-turn-error"));

    // ── Busy ──────────────────────────────────────────────────────────────────
    const transientActivity = lastTurn ? Array.from(lastTurn.querySelectorAll("*")).some((node) => /^(?:Assembling|Thinking|Applying file changes|Generating(?: design)? previews?)(?:…|\.\.\.)?$/i.test(ctx.textOf(node))) : false;
    const busy = isRunning || /\bRunning for\s+\d+s\b/i.test(lastHeader) || transientActivity;

    // ── Blocking dialogs ─────────────────────────────────────────────────────
    const dialogs = visibleAll('[role="dialog"], mat-dialog-container');
    const blockingDialog = dialogs.find((dialog) => !ctx.rootHost?.contains(dialog) && /guided tour|welcome|sign in|consent/i.test(ctx.textOf(dialog))) || null;

    return Core.classifyHostSnapshot({
      mode,
      textarea,
      submit,
      stop,
      submitReady: enabled(submit),
      turnCount: turns.length,
      lastHeader,
      errorText,
      thinkingText,
      retryVisible: !!retry,
      retry,
      busy,
      blocked: !!blockingDialog,
      blockedReason: blockingDialog ? ctx.textOf(blockingDialog).slice(0, 180) : ""
    });
  }

  let cachedHostSnapshot = null;
  let cachedHostSnapshotTime = 0;

  function scanHostCached() {
    const now = Date.now();
    if (cachedHostSnapshot && now - cachedHostSnapshotTime < 250) return cachedHostSnapshot;
    cachedHostSnapshot = scanHost();
    cachedHostSnapshotTime = now;
    return cachedHostSnapshot;
  }
  async function downloadZip() {
    try {
      const directBtn = visibleAll('button[aria-label="Download app"][iconname="download"], button[aria-label="Download app"]')[0];
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
      const code = exactButton("Code");
      if (code) code.click();
      ctx.exportStep = "Opening export menu";
      ctx.requestRender();
      const exportButton = await waitForElement(() => visibleAll('button[aria-label="Export options"]')[0], 3000);
      if (!exportButton) throw new Error("Export options is unavailable; open an app editor first");
      const findZipItem = () => visibleAll('[role="menuitem"], button').find((node) => /^Download as \.zip file\b/i.test(ctx.textOf(node))) || null;
      let zip = findZipItem();
      if (!zip && exportButton.getAttribute("aria-expanded") !== "true") exportButton.click();
      zip = zip || await waitForElement(findZipItem, 1800);
      if (!zip) {
        if (exportButton.getAttribute("aria-expanded") === "true") {
          exportButton.click();
          await ctx.sleep(150);
        }
        exportButton.click();
        zip = await waitForElement(findZipItem, 2200);
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
    const host = scanHost();
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
      const snapshot = createDiagnosticSnapshot();
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
    perceive() { return scanHost(); }
    readOutput() { 
      return readLastTurnContent() || { text: null, type: 'unknown' }; 
    }
    actuate(action, payload) {
      if (action === 'SUBMIT') {
        const host = scanHost();
        if (host.textarea) setNativeValue(host.textarea, payload);
        if (host.submit) robustClick(host.submit);
        return true;
      }
      return false;
    }
  }
  globalThis.AISQHostAdapter = new AIStudioAdapter();

  Object.assign(ctx, {
    downloadZip,
    createDiagnosticSnapshot,
    downloadDiagnostics,
    readLastTurnContent,
    checkHostHealth,
    visibleAll, visible,
    exactButton,
    waitForElement,
    scanHost,
    scanHostCached,
    setNativeValue,
    robustClick
  });
})(typeof globalThis !== "undefined" ? globalThis : this);