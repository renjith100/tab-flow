// ── models.js — Tab & Group data model builders ───────────────────────────────
// Pure data transformations only. No DOM, no Chrome API calls after load.
// getDomain() is defined in popup.js and available as a global at call time.

const SELF_URL = chrome.runtime.getURL('newtab.html');

// Converts a raw Chrome tab object into our internal tab item shape.
function chromeTabToTabItem(chromeTab) {
  return {
    type:       'tab',
    id:         chromeTab.id,
    windowId:   chromeTab.windowId,
    title:      chromeTab.title || 'New Tab',
    domain:     getDomain(chromeTab.url),
    url:        chromeTab.url || '',
    favIconUrl: chromeTab.favIconUrl || '',
    groupId:    chromeTab.groupId,
    audible:    chromeTab.audible || false,
  };
}

// Converts raw Chrome group objects into a map of { groupId → groupCard }.
// Each groupCard starts with an empty tabs array.
function buildGroupCardMap(chromeGroups) {
  const groupCards = {};
  chromeGroups.forEach(g => {
    groupCards[g.id] = {
      type:  'group',
      id:    g.id,
      title: g.title || 'Tab Group',
      color: g.color,
      tabs:  [],
    };
  });
  return groupCards;
}

// Populates each group card's tabs array from the flat tab item list.
function assignTabsToGroupCards(tabItems, groupCards) {
  tabItems.forEach(tab => {
    if (tab.groupId !== -1 && groupCards[tab.groupId]) {
      groupCards[tab.groupId].tabs.push(tab);
    }
  });
}

// Builds the ordered main carousel list by walking Chrome's tab order.
// Ungrouped tabs appear as individual items.
// Grouped tabs appear as a single group card at the position of their first tab.
function buildOrderedMainItems(chromeTabs, tabItems, groupCards) {
  const seenGroups = new Set();
  const mainItems  = [];

  chromeTabs
    .filter(t => t.url !== SELF_URL)
    .forEach(chromeTab => {
      if (chromeTab.groupId === -1) {
        const item = tabItems.find(t => t.id === chromeTab.id);
        if (item) mainItems.push(item);
      } else if (!seenGroups.has(chromeTab.groupId) && groupCards[chromeTab.groupId]) {
        seenGroups.add(chromeTab.groupId);
        mainItems.push(groupCards[chromeTab.groupId]);
      }
    });

  return mainItems;
}

// Top-level entry point called by popup.js.
// Returns { allTabs, mainItems } ready to assign to module state.
function buildAllModels(chromeTabs, chromeGroups) {
  const tabItems   = chromeTabs
    .filter(t => t.url !== SELF_URL)
    .map(chromeTabToTabItem);

  const groupCards = buildGroupCardMap(chromeGroups);
  assignTabsToGroupCards(tabItems, groupCards);
  const mainItems = buildOrderedMainItems(chromeTabs, tabItems, groupCards);

  return { allTabs: tabItems, mainItems };
}
