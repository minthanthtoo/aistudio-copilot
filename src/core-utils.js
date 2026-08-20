(function initAISQCoreUtils(global) {
  "use strict";
  const Core = global.AISQCore;
  const nowISO = () => new Date().toISOString();

  function truncatePayload(payload) {
    const clone = { ...payload };
    if (clone.errorSnippet && clone.errorSnippet.length > 500)
      clone.errorSnippet = clone.errorSnippet.slice(-500);
    if (clone.message && clone.message.length > 300)
      clone.message = clone.message.slice(0, 300) + '…';
    for (const key of Object.keys(clone)) {
      if (clone[key] instanceof Node) delete clone[key];
    }
    return clone;
  }

  const uid = (prefix = "id") => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const normalizeText = (value) => String(value || "").replace(/\r\n?/g, "\n").trim();

  function hashText(value) {
    const text = String(value || "");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }


  function labelForPrompt(text, index) {
    const lines = String(text || "").split("\n").map((line) => line.trim()).filter(Boolean);
    const structured = lines.find((line) => /^(?:#{1,6}\s*)?(?:(?:Stage|Phase|Step|Round|Part)\s+\d+|(?:\[)?(?:P|R)\d{3}(?:\])?|Prompt\s+\d+)\b/i.test(line));
    const first = structured || lines[0] || `Prompt ${index + 1}`;
    const cleaned = first.replace(/^#{1,6}\s*/, "").replace(/^[-*]\s+/, "");
    return cleaned.length > 72 ? `${cleaned.slice(0, 69)}…` : cleaned;
  }

  function extractCommonPreface(preface, parts) {
    if (preface && preface.trim()) return { preface: preface.trim(), parts };
    if (!parts || parts.length < 2) return { preface: preface || "", parts: parts || [] };
    const splitParts = parts.map((p) => p.split("\n"));
    const minLines = Math.min(...splitParts.map((sp) => sp.length));
    let commonLineCount = 0;
    for (let i = 0; i < minLines; i++) {
      const line = splitParts[0][i];
      if (splitParts.every((sp) => sp[i] === line)) {
        commonLineCount++;
      } else {
        break;
      }
    }
    if (commonLineCount > 0) {
      const commonText = splitParts[0].slice(0, commonLineCount).join("\n").trim();
      if (commonText.length >= 15) {
        const trimmedParts = splitParts.map((sp) => sp.slice(commonLineCount).join("\n").trim()).filter(Boolean);
        if (trimmedParts.length === parts.length && trimmedParts.every((p) => p.length > 0)) {
          return { preface: commonText, parts: trimmedParts };
        }
      }
    }
    return { preface: preface || "", parts };
  }



  Object.assign(Core, { nowISO, truncatePayload, uid, normalizeText, hashText, labelForPrompt, extractCommonPreface });
})(typeof globalThis !== "undefined" ? globalThis : this);
