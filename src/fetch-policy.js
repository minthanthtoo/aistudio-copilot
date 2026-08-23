(function initAISQFetchPolicy(global) {
  "use strict";

  const ALLOWED_HOSTS = new Set(["chatgpt.com"]);
  const ALLOWED_SUFFIXES = [".chatgpt.com"];   // suffix-anchored subdomains only
  const MAX_BYTES = 3_000_000;                 // response ceiling (~3 MB)

  function validateFetchUrl(rawUrl) {
    let url;
    try {
      url = new URL(String(rawUrl ?? ""));
    } catch {
      return { ok: false, reason: "invalid url" };
    }
    if (url.protocol !== "https:") {
      return { ok: false, reason: "insecure scheme: " + url.protocol };
    }
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    const allowed =
      ALLOWED_HOSTS.has(host) ||
      ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix));
    if (!allowed) return { ok: false, reason: "host not allowed: " + host };
    return { ok: true, url: url.toString(), maxBytes: MAX_BYTES };
  }

  global.AISQFetchPolicy = Object.freeze({ validateFetchUrl, MAX_BYTES });
})(typeof globalThis !== "undefined" ? globalThis : self);
