"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");

require("../src/fetch-policy.js");
const P = globalThis.AISQFetchPolicy;

test("accepts https chatgpt share urls incl. www subdomain", () => {
  assert.equal(P.validateFetchUrl("https://chatgpt.com/share/abc-123").ok, true);
  assert.equal(P.validateFetchUrl("https://www.chatgpt.com/share/abc").ok, true);
});

for (const bad of ["http://chatgpt.com/share/x", "javascript:alert(1)",
                   "data:text/html,hi", "file:///etc/passwd"]) {
  test(`rejects insecure scheme: ${bad.slice(0, 22)}`, () => {
    const v = P.validateFetchUrl(bad);
    assert.equal(v.ok, false);
    assert.match(v.reason, /scheme|invalid/);
  });
}

for (const host of ["https://evil.example.com/share/x", "https://notchatgpt.com/share/x",
                    "https://chatgpt.com.evil.io/share/x"]) {
  test(`rejects disallowed host: ${host}`, () => {
    const v = P.validateFetchUrl(host);
    assert.equal(v.ok, false);
    assert.match(v.reason, /host|invalid/);
  });
}

for (const junk of [null, undefined, "", 42, "not a url"]) {
  test(`rejects garbage input: ${String(junk)}`, () => {
    const v = P.validateFetchUrl(junk);
    if (v.ok !== false) {
      assert.fail(`expected rejection, got ok=true for ${JSON.stringify(junk)}`);
    }
  });
}

test("exposes byte cap and doubles as final-url validator for redirects (A2)", () => {
  assert.equal(typeof P.MAX_BYTES, "number");
  assert.ok(P.MAX_BYTES >= 100_000);
  assert.equal(P.validateFetchUrl("https://chatgpt.com/share/a").ok, true);
  assert.equal(P.validateFetchUrl("https://evil.io/landed-here").ok, false);
});
