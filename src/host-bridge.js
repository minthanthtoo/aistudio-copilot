(function initAISQHost(global) {
  "use strict";
  const Core = global.AISQCore;
  const ctx = global.AISQContext;
  const PHASES = Core.PHASES;

  function findRetryButton(scope = document) {
    const callouts = ctx.visibleAll("ms-error-callout, ms-chat-turn-error", scope).reverse();
    for (const callout of callouts) {
      const retry = ctx.visibleAll("button", callout).find((button) => ctx.textOf(button).includes("Retry"));
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
    const chat = ctx.getChatContainer();
    if (!chat) return null;
    const allTurns = Array.from(chat.querySelectorAll('.turn:not(.input)'));
    const turns = allTurns.filter(t => t.offsetParent !== null || ctx.visible(t));
    const lastTurn = turns.at(-1);
    if (!lastTurn) return null;

    const contentBlocks = [];
    const elements = ctx.deepQueryAll('.markdown-content > *, .code-block-wrapper, ms-file-chip', lastTurn);
    for (const el of elements) {
      if (!ctx.visible(el)) continue;
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
    const scan = ctx.scanHost();
    if (!ctx.getChatContainer() && scan.mode === 'editor') {
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
    const chat = ctx.getChatContainer();

    // ── Textarea ─────────────────────────────────────────────────────────────
    let editorTextarea = null;
    if (chat) {
      editorTextarea = Array.from(chat.querySelectorAll('textarea.cdk-textarea-autosize, textarea[placeholder*="Make changes"]'))
        .find(el => el.offsetParent !== null || ctx.visible(el)) || null;
    }
    const startTextarea = ctx.visibleAll('textarea[placeholder="Describe an app and let Gemini do the rest"]')[0] || null;
    const mode = editorTextarea ? "editor" : startTextarea ? "start" : "unsupported";
    const textarea = editorTextarea || startTextarea;

    // ── Send / Stop button ────────────────────────────────────────────────────
    let sendBtn = null;
    if (mode === "editor" && chat) {
      sendBtn = Array.from(chat.querySelectorAll('button.send-button, button[aria-label="Send"], button[aria-label="Send prompt"], button[mattooltip="Send prompt"], button[title="Send prompt"]'))
        .find(el => el.offsetParent !== null || ctx.visible(el)) || null;
    }

    // Thinking indicator text (must be ctx.visible)
    const thinkingNode = chat ? Array.from(chat.querySelectorAll('ms-thinking-indicator, .thinking-text'))
      .find(el => ctx.visible(el)) || null : null;
    const thinkingText = thinkingNode ? ctx.textOf(thinkingNode) : "";

    // "running" class on the send button is the most reliable busy signal.
    // We also explicitly look for a "Cancel generation" or "Stop generation" button
    const stopBtn = Array.from(chat ? chat.querySelectorAll('button[aria-label*="Stop"], button[aria-label*="Cancel"], button[mattooltip*="Stop"], button[mattooltip*="Cancel"], button[title*="Stop"], button[title*="Cancel"]') : [])
      .find(el => el.offsetParent !== null || ctx.visible(el)) || null;

    const hasStopIcon = chat ? Array.from(chat.querySelectorAll('mat-icon, .material-icons, .material-symbols-outlined')).some(el => ctx.visible(el) && /^(stop|stop_circle|cancel|pause|pause_circle)$/i.test(ctx.textOf(el).trim())) : false;
    const isStreaming = chat ? !!chat.querySelector('.streaming, .generating, ms-stream-indicator') : false;

    const isRunning = !!(sendBtn?.classList.contains("running") ||
      stopBtn ||
      hasStopIcon ||
      isStreaming ||
      thinkingNode ||
      (chat ? Array.from(chat.querySelectorAll('ms-gradient-spinner')).some(el => ctx.visible(el)) : false));

    // When running: submit = null (can't submit again), stop = the running button.
    const stop = isRunning ? (stopBtn || sendBtn || ctx.deepQueryAll('button.send-button.running, button[aria-label*="Stop"], button[aria-label*="Cancel"]')[0] || null) : null;
    const submit = mode === "editor"
      ? (isRunning ? null : sendBtn)
      : mode === "start" ? ctx.visibleAll("button.build-button")[0] || ctx.exactButton("Build") : null;

    // ── Turns ─────────────────────────────────────────────────────────────────
    let turns = [];
    if (chat) {
      const allTurns = Array.from(chat.querySelectorAll('.turn:not(.input)'));
      // Only keep turns that are actually ctx.visible (some might be hidden templates)
      turns = allTurns.filter(t => t.offsetParent !== null || ctx.visible(t));
    }
    const lastTurn = turns.at(-1) || null;
    const lastHeader = ctx.textOf(lastTurn?.querySelector(".turn-header"));
    const retry = lastTurn ? ctx.findRetryButton(lastTurn) : null;
    const errorText = ctx.textOf(lastTurn?.querySelector("ms-error-callout, ms-chat-turn-error"));

    // ── Busy ──────────────────────────────────────────────────────────────────
    const transientActivity = lastTurn ? Array.from(lastTurn.querySelectorAll("*")).some((node) => /^(?:Assembling|Thinking|Applying file changes|Generating(?: design)? previews?)(?:…|\.\.\.)?$/i.test(ctx.textOf(node))) : false;
    const busy = isRunning || /\bRunning for\s+\d+s\b/i.test(lastHeader) || transientActivity;

    // ── Blocking dialogs ─────────────────────────────────────────────────────
    const dialogs = ctx.visibleAll('[role="dialog"], mat-dialog-container');
    const blockingDialog = dialogs.find((dialog) => !ctx.rootHost?.contains(dialog) && /guided tour|welcome|sign in|consent/i.test(ctx.textOf(dialog))) || null;

    return Core.classifyHostSnapshot({
      mode,
      textarea,
      submit,
      stop,
      submitReady: ctx.enabled(submit),
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
    cachedHostSnapshot = ctx.scanHost();
    cachedHostSnapshotTime = now;
    return cachedHostSnapshot;
  }

  Object.assign(ctx, { findRetryButton, getChatContainer, readLastTurnContent, checkHostHealth, scanHost, scanHostCached });
})(typeof globalThis !== "undefined" ? globalThis : this);
