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
