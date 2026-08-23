"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const contentFiles = manifest.content_scripts.find((entry) => entry.matches.includes("https://aistudio.google.com/*")).js;

// Emulates the service-worker global: importScripts evaluates each file into the
// SAME sandbox global, exactly as a real MV3 service worker would.
function runServiceWorkerSource(source, context) {
  context.importScripts = (...files) => {
    for (const file of files) {
      vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
    }
  };
  vm.runInNewContext(source, context, { filename: "background.js" });
}

test("manifest is a narrow MV3 extension with core loaded before the content runner", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, packageJson.version);
  assert.equal(packageLock.version, packageJson.version);
  assert.equal(packageLock.packages[""].version, packageJson.version);
  assert.deepEqual(manifest.permissions, ["storage", "scripting"]);
  assert.deepEqual(manifest.host_permissions, ["https://aistudio.google.com/*", "https://chatgpt.com/*"]);
  const contentJs = manifest.content_scripts[0].js;
  assert.equal(new Set(contentJs).size, contentJs.length, "content module list has no duplicates");
  assert.ok(contentJs.indexOf("src/core-constants.js") < contentJs.indexOf("src/content.js"));
  assert.ok(contentJs.indexOf("src/content.js") < contentJs.indexOf("src/runner.js"));
  assert.ok(contentJs.indexOf("src/runner.js") < contentJs.indexOf("src/ui-tab-settings.js"));
  assert.equal(contentJs.at(-1), "src/ui-tab-settings.js", "the final module initializes the complete runtime");
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

test("packaging derives runtime source files from the manifest contract", () => {
  const source = fs.readFileSync(path.join(root, "scripts/package-extension.cjs"), "utf8");
  assert.match(source, /manifest\.content_scripts\.flatMap\(\(entry\) => entry\.js/);
  assert.ok(contentFiles.includes("src/plan-engine.js"));
  assert.ok(contentFiles.includes("src/ui-draft-plan.js"));
});

test("packaged archive carries every service-worker importScripts dependency", () => {
  const packager = require("../scripts/package-extension.cjs");
  const files = packager.collectFiles();
  const workerSource = fs.readFileSync(path.join(root, "src/background.js"), "utf8");
  const imports = Array.from(workerSource.matchAll(/importScripts\(\s*["']([^"']+)["']\s*\)/g)).map((match) => match[1]);
  assert.ok(imports.length >= 1, "background.js declares at least one importScripts dependency");
  for (const dependency of imports) {
    assert.ok(files.includes(dependency), `package list includes ${dependency}`);
    assert.equal(fs.existsSync(path.join(root, dependency)), true, `${dependency} exists on disk`);
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
      runtime: { getManifest() { return manifest; } },
      action: { onClicked: { addListener(listener) { actionListener = listener; } } },
      commands: { onCommand: { addListener(listener) { commandListener = listener; } } }
    }
  };
  runServiceWorkerSource(source, context);
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
    files: contentFiles
  }));
  assert.equal(sent.length, 3);
});

test("onInstalled reinjects the manifest-derived module graph in manifest order", async () => {
  const source = fs.readFileSync(path.join(root, "src/background.js"), "utf8");
  let installedListener;
  const injections = [];
  const context = {
    chrome: {
      runtime: {
        getManifest() { return manifest; },
        onInstalled: { addListener(listener) { installedListener = listener; } }
      },
      tabs: {
        query(_query, callback) { callback([{ id: 17 }, { id: 23 }]); },
        onRemoved: { addListener() {} }
      },
      scripting: { async executeScript(options) { injections.push(options); } },
      action: { onClicked: { addListener() {} } },
      commands: { onCommand: { addListener() {} } }
    }
  };
  runServiceWorkerSource(source, context);
  assert.equal(typeof installedListener, "function");
  installedListener();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(JSON.stringify(injections), JSON.stringify([
    { target: { tabId: 17 }, files: contentFiles },
    { target: { tabId: 23 }, files: contentFiles }
  ]));
});

test("service worker fences keyed runner leases, moves ownership, and cleans every closed-tab lease", async () => {
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
      runtime: {
        getManifest() { return manifest; },
        onMessage: { addListener(listener) { messageListener = listener; } }
      },
      tabs: { async query() { return []; }, async sendMessage() {}, onRemoved: { addListener(listener) { tabRemovedListener = listener; } } },
      scripting: { async executeScript() {} },
      action: { onClicked: { addListener() {} } },
      commands: { onCommand: { addListener() {} } }
    }
  };
  runServiceWorkerSource(source, context);

  const send = (message, tabId) => new Promise((resolve) => {
    const asynchronous = messageListener(message, { tab: { id: tabId } }, resolve);
    assert.equal(asynchronous, true);
  });
  const first = await send({ type: "AISQ_LEASE_ACQUIRE", key: "app:alpha", leaseMs: 20_000 }, 11);
  assert.equal(first.ok, true);
  assert.equal(first.tabId, 11);
  assert.ok(first.token);
  const renewal = await send({ type: "AISQ_LEASE_ACQUIRE", key: "app:alpha", leaseMs: 20_000 }, 11);
  assert.equal(renewal.token, first.token, "the same live owner keeps its fencing token");

  const blocked = await send({ type: "AISQ_LEASE_ACQUIRE", key: "app:alpha", leaseMs: 20_000 }, 22);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.ownerTabId, 11);

  const wrongHeartbeat = await send({ type: "AISQ_LEASE_HEARTBEAT", key: "app:alpha", token: "wrong", leaseMs: 20_000 }, 11);
  assert.equal(wrongHeartbeat.ok, false);
  const heartbeat = await send({ type: "AISQ_LEASE_HEARTBEAT", key: "app:alpha", token: first.token, leaseMs: 20_000 }, 11);
  assert.equal(heartbeat.ok, true);

  const missingTokenRelease = await send({ type: "AISQ_LEASE_RELEASE", key: "app:alpha" }, 11);
  assert.equal(missingTokenRelease.ok, false, "a stale owner cannot release without the fencing token");
  assert.equal((await send({ type: "AISQ_LEASE_RELEASE", key: "app:alpha", token: first.token }, 11)).ok, true);
  const second = await send({ type: "AISQ_LEASE_ACQUIRE", key: "app:alpha", leaseMs: 20_000 }, 22);
  assert.equal(second.ok, true);
  assert.equal(second.tabId, 22);

  session.aisqRunnerLeases["app:alpha"].expiresAt = Date.now() - 1;
  const expiredHeartbeat = await send({ type: "AISQ_LEASE_HEARTBEAT", key: "app:alpha", token: second.token, leaseMs: 20_000 }, 22);
  assert.equal(expiredHeartbeat.ok, false, "a heartbeat cannot mint an expired lease");
  const expiredTakeover = await send({ type: "AISQ_LEASE_ACQUIRE", key: "app:alpha", leaseMs: 20_000 }, 33);
  assert.equal(expiredTakeover.ok, true);
  assert.equal(expiredTakeover.tabId, 33);
  assert.notEqual(expiredTakeover.token, second.token, "expiry rotates the fencing token");
  assert.equal((await send({ type: "AISQ_LEASE_RELEASE", key: "app:alpha", token: second.token }, 22)).ok, false, "a stale token cannot release the successor");
  assert.equal((await send({ type: "AISQ_LEASE_HEARTBEAT", key: "app:alpha", token: expiredTakeover.token, leaseMs: 1 }, 33)).expiresAt - Date.now() >= 4_000, true, "lease duration is clamped to five seconds");

  const beta = await send({ type: "AISQ_LEASE_ACQUIRE", key: "app:beta", leaseMs: 20_000 }, 11);
  const gamma = await send({ type: "AISQ_LEASE_ACQUIRE", key: "app:gamma", leaseMs: 20_000 }, 22);
  assert.equal(beta.ok, true);
  assert.equal(gamma.ok, true, "different page keys can run independently");

  const home = await send({ type: "AISQ_LEASE_ACQUIRE", key: "app:home", leaseMs: 20_000 }, 44);
  const moved = await send({ type: "AISQ_LEASE_MOVE", fromKey: "app:home", toKey: "app:destination", token: home.token, leaseMs: 20_000 }, 44);
  assert.equal(moved.ok, true);
  assert.equal(moved.key, "app:destination");
  assert.equal(session.aisqRunnerLeases["app:home"], undefined);
  assert.equal(session.aisqRunnerLeases["app:destination"].token, home.token);
  const badMove = await send({ type: "AISQ_LEASE_MOVE", fromKey: "app:destination", toKey: "app:other", token: "wrong" }, 44);
  assert.equal(badMove.ok, false);
  const occupied = await send({ type: "AISQ_LEASE_ACQUIRE", key: "app:occupied", leaseMs: 20_000 }, 55);
  assert.equal(occupied.ok, true);
  const blockedMove = await send({ type: "AISQ_LEASE_MOVE", fromKey: "app:destination", toKey: "app:occupied", token: home.token }, 44);
  assert.equal(blockedMove.ok, false);

  const sameKey = await Promise.all([
    send({ type: "AISQ_LEASE_ACQUIRE", key: "app:race", leaseMs: 20_000 }, 61),
    send({ type: "AISQ_LEASE_ACQUIRE", key: "app:race", leaseMs: 20_000 }, 62)
  ]);
  assert.equal(sameKey.filter((result) => result.ok).length, 1, "serialized acquire admits one owner per key");

  tabRemovedListener(33);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(session.aisqRunnerLeases["app:alpha"], undefined, "tab close removes every lease owned by the closed tab");
  assert.equal(session.aisqRunnerLeases["app:beta"].tabId, 11, "tab close preserves other owners");
  assert.equal(session.aisqRunnerLeases["app:gamma"].tabId, 22, "tab close preserves unrelated keys");
  const afterClose = await send({ type: "AISQ_LEASE_ACQUIRE", key: "app:alpha", leaseMs: 20_000 }, 44);
  assert.equal(afterClose.ok, true);
  assert.equal(afterClose.tabId, 44);
});
