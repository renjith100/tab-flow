// TabFlow — background service worker
// Opens the full-page UI in a new tab on icon click.
// If a TabFlow tab is already open, focuses it instead of opening another.

const NEWTAB_URL = 'newtab.html';

chrome.action.onClicked.addListener(async () => {
  const url  = chrome.runtime.getURL(NEWTAB_URL);
  const tabs = await chrome.tabs.query({ url });

  if (tabs.length > 0) {
    // Bring existing TabFlow tab into focus
    const tab = tabs[0];
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    // Open fresh
    await chrome.tabs.create({ url });
  }
});
