"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

test("manifest is a narrow MV3 extension with core loaded before the content runner", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, packageJson.version);
  assert.equal(packageLock.version, packageJson.version);
  assert.equal(packageLock.packages[""].version, packageJson.version);
  assert.deepEqual(manifest.permissions, ["storage", "scripting"]);
  assert.deepEqual(manifest.host_permissions, ["https://aistudio.google.com/*", "https://chatgpt.com/*"]);
  const contentJs = manifest.content_scripts[0].js;
  assert.deepStrictEqual(contentJs, [
    "src/core.js",
    "src/spec-engine.js",
    "src/chatgpt-extractor.js",
    "src/content.js"
  ]);
  assert.equal(manifest.content_scripts[0].run_at, "document_idle");
  assert.deepEqual(Object.keys(manifest.icons), ["16", "32", "48", "128"]);
  for (const file of [manifest.background.service_worker, ...manifest.content_scripts[0].js, ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} exists`);
  }
  for (const [size, file] of Object.entries(manifest.icons)) {
    const png = fs.readFileSync(path.join(root, file));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), Number(size));
    assert.equal(png.readUInt32BE(20), Number(size));
  }
});

test("toolbar action and command message only an active AI Studio Apps tab", async () => {
  const source = fs.readFileSync(path.join(root, "src/background.js"), "utf8");
  let actionListener;
  let commandListener;
  const sent = [];
  const injections = [];
  let activeUrl = "https://aistudio.google.com/apps/test";
  let contentAvailable = true;
  const context = {
    setTimeout,
    chrome: {
      tabs: {
        async query() { return [{ id: 42, url: activeUrl }]; },
        async sendMessage(id, message) {
          if (!contentAvailable) throw new Error("Receiving end does not exist");
          sent.push({ id, message });
        }
      },
      scripting: {
        async executeScript(options) {
          injections.push(options);
          contentAvailable = true;
        }
      },
      action: { onClicked: { addListener(listener) { actionListener = listener; } } },
      commands: { onCommand: { addListener(listener) { commandListener = listener; } } }
    }
  };
  vm.runInNewContext(source, context, { filename: "background.js" });
  assert.equal(typeof actionListener, "function");
  assert.equal(typeof commandListener, "function");

  await actionListener();
  assert.equal(JSON.stringify(sent), JSON.stringify([{ id: 42, message: { type: "AISQ_TOGGLE" } }]));
  commandListener("toggle-panel");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sent.length, 2);

  activeUrl = "https://example.com/";
  await actionListener();
  assert.equal(sent.length, 2);

  activeUrl = "https://aistudio.google.com/apps/already-open";
  contentAvailable = false;
  await actionListener();
  assert.equal(injections.length, 1);
  assert.equal(JSON.stringify(injections[0]), JSON.stringify({
    target: { tabId: 42 },
    files: ["src/core.js", "src/spec-engine.js", "src/chatgpt-extractor.js", "src/content.js"]
  }));
  assert.equal(sent.length, 3);
});

test("service worker serializes a single runner lease across AI Studio tabs", async () => {
  const source = fs.readFileSync(path.join(root, "src/background.js"), "utf8");
  let messageListener;
  let tabRemovedListener;
  const session = {};
  const context = {
    setTimeout,
    clearTimeout,
    Date,
    Math,
    chrome: {
      storage: {
        session: {
          async get(key) { return { [key]: session[key] }; },
          async set(values) { Object.assign(session, structuredClone(values)); },
          async remove(key) { delete session[key]; }
        }
      },
      runtime: { onMessage: { addListener(listener) { messageListener = listener; } } },
      tabs: { async query() { return []; }, async sendMessage() {}, onRemoved: { addListener(listener) { tabRemovedListener = listener; } } },
      scripting: { async executeScript() {} },
      action: { onClicked: { addListener() {} } },
      commands: { onCommand: { addListener() {} } }
    }
  };
  vm.runInNewContext(source, context, { filename: "background.js" });

  const send = (message, tabId) => new Promise((resolve) => {
    const asynchronous = messageListener(message, { tab: { id: tabId } }, resolve);
    assert.equal(asynchronous, true);
  });
  const first = await send({ type: "AISQ_LEASE_ACQUIRE", leaseMs: 20_000 }, 11);
  assert.equal(first.ok, true);
  assert.equal(first.tabId, 11);
  assert.ok(first.token);

  const blocked = await send({ type: "AISQ_LEASE_ACQUIRE", leaseMs: 20_000 }, 22);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.ownerTabId, 11);

  const wrongHeartbeat = await send({ type: "AISQ_LEASE_HEARTBEAT", token: "wrong", leaseMs: 20_000 }, 11);
  assert.equal(wrongHeartbeat.ok, false);
  const heartbeat = await send({ type: "AISQ_LEASE_HEARTBEAT", token: first.token, leaseMs: 20_000 }, 11);
  assert.equal(heartbeat.ok, true);

  assert.equal((await send({ type: "AISQ_LEASE_RELEASE", token: first.token }, 11)).ok, true);
  const second = await send({ type: "AISQ_LEASE_ACQUIRE", leaseMs: 20_000 }, 22);
  assert.equal(second.ok, true);
  assert.equal(second.tabId, 22);

  session.aisqRunnerLease.expiresAt = Date.now() - 1;
  const expiredTakeover = await send({ type: "AISQ_LEASE_ACQUIRE", leaseMs: 20_000 }, 33);
  assert.equal(expiredTakeover.ok, true);
  assert.equal(expiredTakeover.tabId, 33);

  tabRemovedListener(33);
  await new Promise((resolve) => setImmediate(resolve));
  const afterClose = await send({ type: "AISQ_LEASE_ACQUIRE", leaseMs: 20_000 }, 44);
  assert.equal(afterClose.ok, true);
  assert.equal(afterClose.tabId, 44);
});
