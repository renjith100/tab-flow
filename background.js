// TabFlow — background service worker
// Opens the full-page UI in a new tab on icon click.
// If a TabFlow tab is already open in the current window, focuses it.
// Each window gets its own independent TabFlow tab.

const NEWTAB_URL = 'newtab.html';

chrome.action.onClicked.addListener(async () => {
  const url  = chrome.runtime.getURL(NEWTAB_URL);
  const tabs = await chrome.tabs.query({ url, currentWindow: true });

  if (tabs.length > 0) {
    // Bring the existing TabFlow tab in this window into focus
    await chrome.tabs.update(tabs[0].id, { active: true });
  } else {
    // Open a fresh TabFlow tab in this window
    await chrome.tabs.create({ url });
  }
});

// ── Toolbar tab-count badge ───────────────────────────────────────────────────
// Reuse countTone() from triage.js (defines globals in the worker scope).
importScripts('triage.js');

const TONE_COLORS = { calm: '#3f3f46', warn: '#f59e0b', alert: '#ef4444' };

async function updateBadge() {
  const selfUrl = chrome.runtime.getURL(NEWTAB_URL);
  const tabs = await chrome.tabs.query({});
  const n = tabs.filter(t => t.url !== selfUrl).length;

  await chrome.action.setBadgeText({ text: n > 0 ? String(n) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: TONE_COLORS[countTone(n)] });
}

chrome.runtime.onStartup.addListener(updateBadge);
chrome.runtime.onInstalled.addListener(updateBadge);
chrome.tabs.onCreated.addListener(updateBadge);
chrome.tabs.onRemoved.addListener(updateBadge);
chrome.tabs.onAttached.addListener(updateBadge);
chrome.tabs.onDetached.addListener(updateBadge);
chrome.tabs.onUpdated.addListener((_id, changeInfo) => {
  if ('url' in changeInfo) updateBadge();
});

// Initial paint when the service worker first loads.
updateBadge();
