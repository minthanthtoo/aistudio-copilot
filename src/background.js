"use strict";

const CONTENT_FILES = Object.freeze((chrome.runtime?.getManifest?.().content_scripts || [])
  .find((entry) => entry.matches?.includes("https://aistudio.google.com/*"))?.js?.slice() || []);
const LEASES_KEY = "aisqRunnerLeases";
const DEFAULT_LEASE_MS = 20_000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let memoryLeases = {};
let leaseQueue = Promise.resolve();

function serializedLeaseOperation(operation) {
  const result = leaseQueue.then(operation, operation);
  leaseQueue = result.catch(() => {});
  return result;
}

async function readLeases() {
  if (!chrome.storage?.session) return { ...memoryLeases };
  const value = await chrome.storage.session.get(LEASES_KEY);
  return { ...(value?.[LEASES_KEY] || {}) };
}

async function writeLeases(leases) {
  memoryLeases = { ...leases };
  if (!chrome.storage?.session) return;
  await chrome.storage.session.set({ [LEASES_KEY]: { ...leases } });
}

function leaseDuration(message) {
  return Math.max(5_000, Math.min(60_000, Number(message?.leaseMs || DEFAULT_LEASE_MS)));
}

function leaseToken(tabId) {
  return `${tabId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function handleLeaseMessage(message, sender) {
  const tabId = sender?.tab?.id;
  if (!Number.isInteger(tabId)) return { ok: false, error: "Runner lease requires an AI Studio tab" };
  const key = String(message.key || "root");
  const now = Date.now();
  const leases = await readLeases();
  const current = leases[key] || null;
  const currentExpired = !current || Number(current.expiresAt || 0) <= now;

  if (message.type === "AISQ_LEASE_ACQUIRE") {
    if (!currentExpired && current.tabId !== tabId) {
      return { ok: false, ownerTabId: current.tabId, expiresAt: current.expiresAt };
    }
    const lease = {
      tabId,
      token: !currentExpired && current?.tabId === tabId && current?.token ? current.token : leaseToken(tabId),
      updatedAt: now,
      expiresAt: now + leaseDuration(message)
    };
    leases[key] = lease;
    await writeLeases(leases);
    return { ok: true, ...lease };
  }

  if (message.type === "AISQ_LEASE_HEARTBEAT") {
    if (currentExpired) {
      return { ok: false, ownerTabId: null, error: "Runner lease is missing or expired" };
    }
    
    if (current.tabId !== tabId || current.token !== message.token) {
      return { ok: false, ownerTabId: current?.tabId || null };
    }
    
    const lease = { ...current, updatedAt: now, expiresAt: now + leaseDuration(message) };
    leases[key] = lease;
    await writeLeases(leases);
    return { ok: true, ...lease };
  }

  if (message.type === "AISQ_LEASE_RELEASE") {
    if (!current) return { ok: true };
    if (current.tabId !== tabId || !message.token || current.token !== message.token) {
      return { ok: false, ownerTabId: current.tabId, error: "Runner lease token does not match" };
    }
    delete leases[key];
    await writeLeases(leases);
    return { ok: true };
  }

  if (message.type === "AISQ_LEASE_MOVE") {
    const fromKey = String(message.fromKey || "");
    const toKey = String(message.toKey || "");
    if (!fromKey || !toKey) return { ok: false, error: "Runner lease move requires both keys" };
    const source = leases[fromKey] || null;
    const sourceExpired = !source || Number(source.expiresAt || 0) <= now;
    if (sourceExpired || source.tabId !== tabId || !message.token || source.token !== message.token) {
      return { ok: false, ownerTabId: source?.tabId || null, error: "Runner lease move source does not match" };
    }
    const target = leases[toKey] || null;
    const targetExpired = !target || Number(target.expiresAt || 0) <= now;
    if (fromKey !== toKey && !targetExpired) {
      return { ok: false, ownerTabId: target.tabId, expiresAt: target.expiresAt };
    }
    const lease = { ...source, updatedAt: now, expiresAt: now + leaseDuration(message) };
    if (fromKey !== toKey) delete leases[fromKey];
    leases[toKey] = lease;
    await writeLeases(leases);
    return { ok: true, key: toKey, ...lease };
  }

  return { ok: false, error: "Unknown lease operation" };
}

async function removeLeasesForTab(tabId) {
  const leases = await readLeases();
  let changed = false;
  for (const [key, lease] of Object.entries(leases)) {
    if (lease?.tabId !== tabId) continue;
    delete leases[key];
    changed = true;
  }
  if (changed) await writeLeases(leases);
}

if (chrome.runtime?.onMessage?.addListener) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "AISQ_GET_TAB_ID") {
      sendResponse({ tabId: sender?.tab?.id ?? null });
      return false;
    }
    if (message?.type === "AISQ_RELOAD_EXTENSION") {
      setTimeout(() => chrome.runtime.reload(), 100);
      return false;
    }
    if (message?.type === "AISQ_FETCH_URL") {
      fetch(message.url, { headers: { "Accept": "text/html" } })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
          return res.text();
        })
        .then(html => sendResponse({ ok: true, html }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true; // async response
    }
    if (!["AISQ_LEASE_ACQUIRE", "AISQ_LEASE_HEARTBEAT", "AISQ_LEASE_RELEASE", "AISQ_LEASE_MOVE"].includes(message?.type)) return false;
    serializedLeaseOperation(() => handleLeaseMessage(message, sender)).then(sendResponse, (error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  });
}

if (chrome.runtime?.onInstalled?.addListener) {
  chrome.runtime.onInstalled.addListener(() => {
    if (chrome.tabs && chrome.scripting) {
      chrome.tabs.query({ url: "https://aistudio.google.com/*" }, (tabs) => {
        for (const tab of tabs) {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: CONTENT_FILES
          }).catch(() => {});
        }
      });
    }
  });
}

if (chrome.tabs?.onRemoved?.addListener) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    void serializedLeaseOperation(async () => {
      await removeLeasesForTab(tabId);
    });
  });
}

async function sendToggle(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "AISQ_TOGGLE" });
    return true;
  } catch {
    // A newly loaded unpacked extension is not injected into tabs that were
    // already open. The action is a user gesture, so repair that state here.
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: CONTENT_FILES
    });
  } catch {
    return false;
  }

  for (const delayMs of [0, 75, 150, 300, 600, 1000]) {
    if (delayMs) await wait(delayMs);
    try {
      await chrome.tabs.sendMessage(tabId, { type: "AISQ_SHOW" });
      return true;
    } catch {
      // init() may still be awaiting chrome.storage.local on this attempt.
    }
  }
  return false;
}

async function toggleActiveTab(actionTab) {
  const tab = (actionTab && actionTab.id) ? actionTab : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab?.id || !String(tab.url || "").startsWith("https://aistudio.google.com/")) return;
  await sendToggle(tab.id);
}

chrome.action.onClicked.addListener(toggleActiveTab);
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-panel") toggleActiveTab();
});
