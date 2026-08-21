(function initAISQHostDom(global) {
  "use strict";
  const Core = global.AISQCore;
  const ctx = global.AISQContext;

  function visible(node) {
    if (!(node instanceof Element)) return false;
    try {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
    } catch {
      // Host DOM nodes can cross the isolated-world boundary while AI Studio
      // swaps editor surfaces. Treat an uninspectable node as hidden instead
      // of letting a native DOM "Illegal invocation" abort the runner tick.
      return false;
    }
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
        if (child.id === ctx.ROOT_ID || (ctx.rootHost && child === ctx.rootHost)) continue;
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
    control.focus();
    
    // Most robust framework-agnostic way to simulate typing
    try {
      control.select();
      if (document.execCommand("insertText", false, value)) {
        control.dispatchEvent(new Event("input", { bubbles: true, cancelable: true, composed: true }));
        return;
      }
    } catch {}

    // Fallback to prototype setter
    const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) {
      control.value = value;
    } else {
      setter.call(control, value);
    }
    
    control.dispatchEvent(new Event("input", { bubbles: true, cancelable: true, composed: true }));
    control.dispatchEvent(new Event("change", { bubbles: true, cancelable: true, composed: true }));
    try {
      control.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, composed: true, inputType: "insertText", data: value }));
    } catch {}
  }

  
  

  function stashText() {
    const ta = ctx.scanHostCached().textarea;
    if (!ta) return;
    const original = ta.value ?? "";
    if (!original.trim()) return;
    ctx.textStash = { original, selStart: ta.selectionStart, selEnd: ta.selectionEnd };
    setNativeValue(ta, "");
  }

  function restoreText() {
    if (!ctx.textStash) return;
    const ta = ctx.scanHostCached().textarea;
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


  Object.assign(ctx, { visible, deepQueryAll, visibleAll, exactButton, enabled, waitForElement, setNativeValue, stashText, restoreText, robustClick });
})(typeof globalThis !== "undefined" ? globalThis : this);
