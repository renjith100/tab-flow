// TabFlow — background service worker
// Opens the full-page UI in a new tab on icon click.
// If a TabFlow tab is already open in the current window, focuses it.
// Each window gets its own independent TabFlow tab.

const NEWTAB_URL = 'newtab.html';

// Open (or focus) the TabFlow tab of one specific window. Scoped by windowId
// rather than currentWindow — in a service worker "current window" is a focus
// heuristic that can point at another window when several are open.
async function openTabFlowInWindow(windowId) {
  const url  = chrome.runtime.getURL(NEWTAB_URL);
  const tabs = await chrome.tabs.query({ url, windowId });

  if (tabs.length > 0) {
    // Bring the existing TabFlow tab in this window into focus
    await chrome.tabs.update(tabs[0].id, { active: true });
  } else {
    // Open a fresh TabFlow tab in this window
    await chrome.tabs.create({ url, windowId });
  }
}

// The event's tab argument is the active tab of the window whose icon was
// clicked — the one reliable source for which window the user meant.
chrome.action.onClicked.addListener(tab => openTabFlowInWindow(tab.windowId));

// ── Toolbar tab-count badge ───────────────────────────────────────────────────
// Reuse countTone() from triage.js (defines globals in the worker scope).
importScripts('triage.js');

const TONE_COLORS = { calm: '#3f3f46', warn: '#f59e0b', alert: '#ef4444' };

// The badge shows the tab count for ITS OWN window. Chrome only shows the active
// tab's badge, so we set the badge per-window on that window's active tab.
async function updateWindowBadge(windowId) {
  if (windowId == null || windowId === chrome.windows.WINDOW_ID_NONE) return;
  try {
    const selfUrl = chrome.runtime.getURL(NEWTAB_URL);
    const tabs = await chrome.tabs.query({ windowId });
    const active = tabs.find(t => t.active);
    if (!active) return;
    const n = tabs.filter(t => t.url !== selfUrl).length;
    await chrome.action.setBadgeText({ tabId: active.id, text: n > 0 ? String(n) : '' });
    await chrome.action.setBadgeBackgroundColor({ tabId: active.id, color: TONE_COLORS[countTone(n)] });
  } catch (err) {
    console.error('TabFlow: updateWindowBadge failed', err);
  }
}

// Refresh every window (startup / install). Also clears any stale global badge
// from older versions so only the per-window counts show.
async function updateAllBadges() {
  try {
    await chrome.action.setBadgeText({ text: '' });
    const windows = await chrome.windows.getAll();
    await Promise.all(windows.map(w => updateWindowBadge(w.id)));
  } catch (err) {
    console.error('TabFlow: updateAllBadges failed', err);
  }
}

chrome.runtime.onStartup.addListener(updateAllBadges);
chrome.runtime.onInstalled.addListener(updateAllBadges);

// A window's tab count changed → refresh that window's active-tab badge.
chrome.tabs.onCreated.addListener(tab => updateWindowBadge(tab.windowId));
chrome.tabs.onRemoved.addListener((_id, info) => {
  if (!info.isWindowClosing) updateWindowBadge(info.windowId);
});
chrome.tabs.onAttached.addListener((_id, info) => updateWindowBadge(info.newWindowId));
chrome.tabs.onDetached.addListener((_id, info) => updateWindowBadge(info.oldWindowId));
chrome.tabs.onUpdated.addListener((_id, changeInfo, tab) => {
  if ('url' in changeInfo) updateWindowBadge(tab.windowId);
});
// Switching tabs changes which tab's badge is visible → set the new active tab's.
chrome.tabs.onActivated.addListener(info => updateWindowBadge(info.windowId));

// Initial paint when the service worker first loads.
updateAllBadges();
