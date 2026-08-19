(function initAISQCoreParser(global) {
  "use strict";

  const Core = global.AISQCore || (typeof require !== "undefined" ? require("./core.js") : {});

  function mapLinesOutsideFences(text, predicate) {
    const lines = text.split("\n");
    const matches = [];
    let fence = null;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const marker = line.match(/^\s*(```+|~~~+)/)?.[1]?.slice(0, 3) || null;
      if (marker) fence = fence ? (fence === marker ? null : fence) : marker;
      if (!fence && predicate(line, index, lines)) matches.push(index);
    }
    return { lines, matches };
  }

  function splitAtHeaders(text, headerPattern) {
    const { lines, matches } = mapLinesOutsideFences(text, (line) => headerPattern.test(line));
    if (matches.length < 2) return null;
    const preface = lines.slice(0, matches[0]).join("\n").trim();
    const parts = matches.map((start, index) => {
      const end = matches[index + 1] ?? lines.length;
      return lines.slice(start, end).join("\n").trim();
    }).filter(Boolean);
    return parts.length >= 2 ? { preface, parts } : null;
  }

  function splitAtDelimiters(text) {
    const delimiter = /^\s*(?:-{3,}|_{3,}|\*{3,}|⸻+|—{3,})\s*$/;
    const { lines, matches } = mapLinesOutsideFences(text, (line) => delimiter.test(line));
    if (!matches.length) return null;
    const points = [-1, ...matches, lines.length];
    const chunks = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const block = lines.slice(points[index] + 1, points[index + 1]).join("\n").trim();
      chunks.push(block);
    }
    let preface = "";
    let parts = chunks;
    const headerPattern = /^(?:#{1,6}\s*)?(?:(?:Stage|Phase|Step|Round|Part)\s+\d+|(?:\[)?(?:P|R)\d{3}(?:\])?|Prompt\s+\d+)\b/i;
    if (chunks.length > 1 && !headerPattern.test(chunks[0]) && headerPattern.test(chunks[1])) {
      preface = chunks[0];
      parts = chunks.slice(1);
    } else if (chunks.length > 1 && !chunks[0]) {
      preface = chunks[0];
      parts = chunks.slice(1);
    } else if (chunks.length > 1 && chunks[0].length < 24 && !headerPattern.test(chunks[0])) {
      preface = chunks[0];
      parts = chunks.slice(1);
    }
    parts = parts.filter(Boolean);
    if (parts.length < 2 || parts.some((part) => part.length < 24)) return null;
    return { preface, parts };
  }

  function splitNumberedBlocks(text) {
    const { lines, matches } = mapLinesOutsideFences(text, (line) => /^[ \t]{0,3}\d+[.)]\s+\S/.test(line));
    if (matches.length < 3) return null;
    const preface = lines.slice(0, matches[0]).join("\n").trim();
    const parts = matches.map((start, index) => {
      const end = matches[index + 1] ?? lines.length;
      return lines.slice(start, end).join("\n").trim();
    }).filter(Boolean);
    if (parts.some((part) => part.length < 40)) return null;
    return { preface, parts };
  }

  function parsePromptPack(raw, strategy = "auto") {
    const text = Core.normalizeText(raw);
    if (!text) return { strategy: "empty", preface: "", prompts: [] };

    const strategies = {
      stage: () => splitAtHeaders(text, /^[ \t]{0,3}(?:#{1,6}\s*)?(?:Stage|Phase|Step|Round|Part)\s+\d+\b/i),
      id: () => splitAtHeaders(text, /^[ \t]{0,3}(?:#{1,6}\s*)?(?:\[)?(?:P|R)\d{3}(?:\])?\b/i),
      prompt: () => splitAtHeaders(text, /^[ \t]{0,3}(?:#{1,6}\s*)?Prompt\s+\d+\b/i),
      delimiter: () => splitAtDelimiters(text),
      numbered: () => splitNumberedBlocks(text),
      single: () => ({ preface: "", parts: [text] })
    };

    if (strategy !== "auto") {
      const selected = strategies[strategy] ? strategies[strategy]() : null;
      if (selected && selected.parts.length) {
        const extracted = Core.extractCommonPreface(selected.preface, selected.parts);
        return { strategy, preface: extracted.preface || "", prompts: Core.promptRecords(extracted.parts) };
      }
      return { strategy: "single", preface: "", prompts: Core.promptRecords([text]) };
    }

    for (const name of ["delimiter", "stage", "id", "prompt", "numbered"]) {
      const result = strategies[name]();
      if (result && result.parts.length) {
        const extracted = Core.extractCommonPreface(result.preface, result.parts);
        return { strategy: name, preface: extracted.preface || "", prompts: Core.promptRecords(extracted.parts) };
      }
    }
    return { strategy: "single", preface: "", prompts: Core.promptRecords([text]) };
  }

  const api = {
    parsePromptPack,
    splitAtHeaders,
    splitAtDelimiters,
    splitNumberedBlocks
  };

  if (global.AISQCore) {
    Object.assign(global.AISQCore, api);
  } else {
    global.AISQCoreParser = api;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
