"use strict";

const CONTENT_FILES = ["src/core.js","src/core-parser.js","src/spec-data.js","src/spec-engine.js","src/chatgpt-extractor.js","src/evidence.js","src/authority.js","src/goal.js","src/memory.js","src/adapter-interface.js","src/content.js","src/host-bridge.js","src/runner.js","src/ui-tabs.js"];
const LEASE_KEY = "aisqRunnerLease";
const DEFAULT_LEASE_MS = 20_000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let memoryLease = null;
let leaseQueue = Promise.resolve();

function serializedLeaseOperation(operation) {
  const result = leaseQueue.then(operation, operation);
  leaseQueue = result.catch(() => {});
  return result;
}

async function readLease() {
  if (!chrome.storage?.session) return memoryLease;
  const value = await chrome.storage.session.get(LEASE_KEY);
  return value?.[LEASE_KEY] || null;
}

async function writeLease(lease) {
  memoryLease = lease || null;
  if (!chrome.storage?.session) return;
  if (lease) await chrome.storage.session.set({ [LEASE_KEY]: lease });
  else await chrome.storage.session.remove(LEASE_KEY);
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
  const now = Date.now();
  const current = await readLease();
  const currentExpired = !current || Number(current.expiresAt || 0) <= now;

  if (message.type === "AISQ_LEASE_ACQUIRE") {
    if (!currentExpired && current.tabId !== tabId) {
      return { ok: false, ownerTabId: current.tabId, expiresAt: current.expiresAt };
    }
    const lease = {
      tabId,
      token: current?.tabId === tabId && current?.token ? current.token : leaseToken(tabId),
      updatedAt: now,
      expiresAt: now + leaseDuration(message)
    };
    await writeLease(lease);
    return { ok: true, ...lease };
  }

  if (message.type === "AISQ_LEASE_HEARTBEAT") {
    if (currentExpired || current.tabId !== tabId || current.token !== message.token) {
      return { ok: false, ownerTabId: currentExpired ? null : current?.tabId || null };
    }
    const lease = { ...current, updatedAt: now, expiresAt: now + leaseDuration(message) };
    await writeLease(lease);
    return { ok: true, ...lease };
  }

  if (message.type === "AISQ_LEASE_RELEASE") {
    if (current && current.tabId === tabId && (!message.token || current.token === message.token)) await writeLease(null);
    return { ok: true };
  }

  return { ok: false, error: "Unknown lease operation" };
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
    if (!["AISQ_LEASE_ACQUIRE", "AISQ_LEASE_HEARTBEAT", "AISQ_LEASE_RELEASE"].includes(message?.type)) return false;
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
            files: ["src/core.js", "src/spec-engine.js", "src/chatgpt-extractor.js", "src/content.js"]
          }).catch(() => {});
        }
      });
    }
  });
}

if (chrome.tabs?.onRemoved?.addListener) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    void serializedLeaseOperation(async () => {
      const current = await readLease();
      if (current?.tabId === tabId) await writeLease(null);
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
