// ── State ─────────────────────────────────────────────────────────────────────
let allTabs     = [];      // flat list of all tab objects (with groupId)
let mainItems   = [];      // main carousel items: ungrouped tabs + group cards
let filtered    = [];      // current carousel subset (main or group)
let active      = 0;       // index into filtered[]
let cardEls     = [];      // persistent DOM refs — never destroyed on navigate
let viewMode    = 'main';  // 'main' | 'group'
let activeGroup = null;    // group item currently being browsed

// ── Tab group color map ────────────────────────────────────────────────────────
const GROUP_COLORS = {
  grey: '#9ca3af', gray: '#9ca3af',
  blue: '#60a5fa', red:  '#f87171',
  yellow: '#fbbf24', green: '#34d399',
  pink: '#f472b6',  purple: '#c084fc', cyan: '#22d3ee',
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const cardsEl    = document.getElementById('cards');
const searchEl   = document.getElementById('search');
const curEl      = document.getElementById('cur');
const totEl      = document.getElementById('tot');
const emptyEl    = document.getElementById('empty');
const detailEl   = document.getElementById('detail');
const toastEl         = document.getElementById('toast');
const toastLabel      = document.getElementById('toastLabel');
const toastUndo       = document.getElementById('toastUndo');
const hintExitGroupEl = document.getElementById('hintExitGroup');

// ── Cover Flow position configs per distance from center ──────────────────────
const POSITIONS = [
  { tx:   0, tz:   0, ry:  0, sc: 1.00, op: 1.00, zi: 100 }, // center
  { tx: 220, tz: -55, ry: 52, sc: 0.84, op: 0.88, zi:  90 }, // ±1
  { tx: 384, tz:-125, ry: 64, sc: 0.69, op: 0.62, zi:  80 }, // ±2
  { tx: 502, tz:-188, ry: 71, sc: 0.56, op: 0.38, zi:  70 }, // ±3
  { tx: 588, tz:-238, ry: 75, sc: 0.46, op: 0.16, zi:  60 }, // ±4+
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDomain(url) {
  try {
    return new URL(url || '').hostname.replace(/^www\./, '') || 'chrome';
  } catch {
    return 'chrome';
  }
}

// Prefer the tab's own favicon URL; fall back to Google's favicon service
function favUrl(tab) {
  if (tab.favIconUrl && tab.favIconUrl.startsWith('http')) {
    return tab.favIconUrl;
  }
  const domain = getDomain(tab.url);
  if (domain && domain !== 'chrome') {
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  }
  return null;
}

function getPos(offset) {
  const idx  = Math.min(Math.abs(offset), POSITIONS.length - 1);
  const sign = Math.sign(offset);
  const p    = POSITIONS[idx];
  return {
    tx: sign * p.tx,
    tz: p.tz,
    // Left cards: positive rotateY → right face tilts toward viewer
    // Right cards: negative rotateY → left face tilts toward viewer
    ry: sign * -p.ry,
    sc: p.sc,
    op: p.op,
    zi: p.zi,
  };
}

// ── buildCards: create DOM once (on init or after filtering) ──────────────────
function buildCards() {
  cardsEl.innerHTML = '';
  cardEls = [];

  if (filtered.length === 0) {
    emptyEl.classList.add('show');
    curEl.textContent = '0';
    totEl.textContent = '0';
    detailEl.innerHTML = '';
    return;
  }

  emptyEl.classList.remove('show');

  filtered.forEach((t, i) => {
    const card = document.createElement('div');
    card.className = 'card';

    if (t.type === 'group') {
      // ── Group card ──────────────────────────────────────────────────────────
      card.classList.add('card-group');
      const color = GROUP_COLORS[t.color] || '#9ca3af';
      card.style.setProperty('--group-color', color);

      // Favicon cluster (up to 4 tabs)
      const cluster = document.createElement('div');
      cluster.className = 'group-favicon-cluster';
      t.tabs.slice(0, 4).forEach(tab => {
        const fav = document.createElement('div');
        fav.className = 'group-fav';
        const url = favUrl(tab);
        if (url) {
          const img = document.createElement('img');
          img.src = url;
          img.alt = tab.title;
          img.onerror = function () { this.replaceWith(makeGroupFallback(tab.domain)); };
          fav.appendChild(img);
        } else {
          fav.appendChild(makeGroupFallback(tab.domain));
        }
        cluster.appendChild(fav);
      });

      const nameEl = document.createElement('div');
      nameEl.className = 'group-name';
      nameEl.textContent = t.title || 'Tab Group';

      const countEl = document.createElement('div');
      countEl.className = 'group-count';
      countEl.textContent = `${t.tabs.length} tab${t.tabs.length !== 1 ? 's' : ''}`;

      card.appendChild(cluster);
      card.appendChild(nameEl);
      card.appendChild(countEl);

      // Click: navigate to group card, or enter it if already active
      card.addEventListener('click', () => {
        if (drag.moved) return;
        if (i === active) enterGroup(t);
        else { active = i; updatePositions(); }
      });

    } else {
      // ── Tab card (existing layout) ───────────────────────────────────────────
      const ring = document.createElement('div');
      ring.className = 'fav-ring';

      const url = favUrl(t);
      if (url) {
        const img = document.createElement('img');
        img.className = 'fav-img';
        img.src = url;
        img.alt = t.title;
        img.onerror = function () {
          this.remove();
          ring.appendChild(makeFallback(t.domain));
        };
        ring.appendChild(img);
      } else {
        ring.appendChild(makeFallback(t.domain));
      }

      const titleEl = document.createElement('div');
      titleEl.className = 'card-title';
      titleEl.textContent = t.title;

      const domainEl = document.createElement('div');
      domainEl.className = 'card-domain';
      domainEl.textContent = t.domain;

      card.appendChild(ring);
      card.appendChild(titleEl);
      card.appendChild(domainEl);

      // Drag-to-close only on tab cards
      card.addEventListener('mousedown',  e => initDrag(e, i));
      card.addEventListener('touchstart', e => initDrag(e, i), { passive: false });
      card.addEventListener('click', () => {
        if (drag.moved) return;
        if (i === active) openTab();
        else { active = i; updatePositions(); }
      });
    }

    cardsEl.appendChild(card);
    cardEls.push(card);
  });

  // Set initial positions instantly (suppress transition on first paint)
  updatePositions({ instant: true });
}

function makeFallback(domain) {
  const fb = document.createElement('div');
  fb.className = 'fav-fallback';
  fb.style.background = '#2a2a3a';
  fb.textContent = (domain || 'T')[0].toUpperCase();
  return fb;
}

function makeGroupFallback(domain) {
  const fb = document.createElement('div');
  fb.className = 'group-fav-fallback';
  fb.style.background = '#2a2a3a';
  fb.textContent = (domain || 'T')[0].toUpperCase();
  return fb;
}

// ── updatePositions: mutate styles only — CSS transition does the animation ───
function updatePositions({ instant = false } = {}) {
  if (!cardEls.length) return;

  curEl.textContent = active + 1;
  totEl.textContent = filtered.length;

  const item = filtered[active];
  detailEl.textContent = '';
  if (item.type === 'group') {
    const color = GROUP_COLORS[item.color] || '#9ca3af';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'hl';
    titleSpan.style.color = color;
    titleSpan.textContent = item.title;
    const count = item.tabs.length;
    detailEl.appendChild(titleSpan);
    detailEl.appendChild(document.createTextNode(` · ${count} tab${count !== 1 ? 's' : ''}`));
  } else {
    if (viewMode === 'group') {
      const breadcrumbSpan = document.createElement('span');
      breadcrumbSpan.className = 'group-breadcrumb';
      breadcrumbSpan.style.color = GROUP_COLORS[activeGroup.color] || '#9ca3af';
      breadcrumbSpan.textContent = activeGroup.title;
      detailEl.appendChild(breadcrumbSpan);
      detailEl.appendChild(document.createTextNode(' › '));
    }
    const titleSpan = document.createElement('span');
    titleSpan.className = 'hl';
    titleSpan.textContent = item.title;
    detailEl.appendChild(titleSpan);
    detailEl.appendChild(document.createTextNode(` · ${item.domain}`));
  }

  cardEls.forEach((card, i) => {
    const offset = i - active;
    const { tx, tz, ry, sc, op, zi } = getPos(offset);
    const far = Math.abs(offset) > 4;

    if (instant) card.style.transition = 'none';

    card.style.transform     = `translateX(${tx}px) translateZ(${tz}px) rotateY(${ry}deg) scale(${sc})`;
    card.style.opacity       = far ? '0' : op;
    card.style.zIndex        = zi;
    card.style.pointerEvents = far ? 'none' : 'auto';
    card.classList.toggle('is-active', i === active);

    if (instant) {
      card.offsetHeight;       // force reflow so "no-transition" frame commits
      card.style.transition = '';
    }
  });
}

// ── Navigation ────────────────────────────────────────────────────────────────
function go(dir) {
  if (!filtered.length) return;
  active = Math.max(0, Math.min(filtered.length - 1, active + dir));
  updatePositions();
}

function openTab() {
  const tab = filtered[active];
  if (!tab || tab.type !== 'tab') return;

  const activeCard = cardEls[active];
  if (activeCard) activeCard.classList.add('flash');

  // Brief flash, then switch — feels intentional rather than instant
  setTimeout(() => {
    chrome.tabs.update(tab.id, { active: true });
    chrome.windows.update(tab.windowId, { focused: true });
  }, 160);
}

// ── Centralized model cleanup when a tab is closed ────────────────────────────
// Keeps filtered, allTabs, mainItems and group .tabs arrays in sync.
function removeTabFromModels(tab, filteredIdx) {
  filtered.splice(filteredIdx, 1);

  const ai = allTabs.findIndex(t => t.id === tab.id);
  if (ai !== -1) allTabs.splice(ai, 1);

  if (tab.groupId !== -1) {
    // Grouped tab: update the group card's tabs array
    const groupCard = mainItems.find(item => item.type === 'group' && item.id === tab.groupId);
    if (groupCard) {
      const ti = groupCard.tabs.findIndex(t => t.id === tab.id);
      if (ti !== -1) groupCard.tabs.splice(ti, 1);
      // If the group is now empty, drop its card from mainItems too
      if (groupCard.tabs.length === 0) {
        const mi = mainItems.indexOf(groupCard);
        if (mi !== -1) mainItems.splice(mi, 1);
      }
    }
  } else {
    // Ungrouped tab: remove directly from mainItems
    const mi = mainItems.findIndex(item => item.type === 'tab' && item.id === tab.id);
    if (mi !== -1) mainItems.splice(mi, 1);
  }
}

// ── Close active tab (Escape key in newtab mode) ──────────────────────────────
function closeActiveTab() {
  if (!filtered.length) return;
  const idx  = active;
  const item = filtered[idx];
  if (!item || item.type !== 'tab') return;
  const card = cardEls[idx];
  if (!card) return;

  // Red glow for 100ms so the user sees what's about to be deleted, then poof up
  card.classList.add('will-close');
  setTimeout(() => {
    card.classList.remove('will-close');
    card.style.transition = 'transform 0.25s cubic-bezier(0.4, 0, 1, 1), opacity 0.2s ease';
    card.style.transform  = 'translateX(0) translateY(-160px) rotateZ(-4deg) scale(0.05)';
    card.style.opacity    = '0';

    setTimeout(() => {
      const currentIdx = filtered.findIndex(t => t.id === item.id);
      if (currentIdx === -1) return; // already removed by a concurrent close
      removeTabFromModels(item, currentIdx);
      chrome.tabs.remove(item.id);
      showUndoToast(item.title);
      active = Math.min(active, Math.max(0, filtered.length - 1));
      buildCards();
    }, 260);
  }, 100);
}

// ── Tab group navigation ───────────────────────────────────────────────────────
function enterGroup(group) {
  viewMode    = 'group';
  activeGroup = group;
  filtered    = [...group.tabs];
  active      = 0;
  if (hintExitGroupEl) hintExitGroupEl.style.display = '';
  buildCards();
}

function exitGroup() {
  const groupIdx = mainItems.findIndex(item => item.type === 'group' && item.id === activeGroup.id);
  viewMode    = 'main';
  activeGroup = null;
  filtered    = [...mainItems];
  active      = groupIdx >= 0 ? groupIdx : 0;
  if (hintExitGroupEl) hintExitGroupEl.style.display = 'none';
  buildCards();
}

// ── Undo (reopen last closed tab via Chrome sessions API) ─────────────────────
let toastTimer = null;

function showUndoToast(title) {
  toastLabel.textContent = 'Closed ';
  const strong = document.createElement('strong');
  strong.textContent = title;
  toastLabel.appendChild(strong);
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideUndoToast, 4000);
}

function hideUndoToast() {
  toastEl.classList.remove('show');
}

async function undoClose() {
  hideUndoToast();
  const sessions = await new Promise(r =>
    chrome.sessions.getRecentlyClosed({ maxResults: 1 }, r)
  );
  const entry = sessions[0];
  if (!entry) return;
  const sessionId = entry.tab ? entry.tab.sessionId : entry.window?.sessionId;
  if (sessionId) {
    await chrome.sessions.restore(sessionId);
    await init();
  }
}

toastUndo.addEventListener('click', undoClose);

// ── Keyboard ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const inSearch = document.activeElement === searchEl;

  if (inSearch) {
    if (e.key === 'Escape')          { searchEl.value = ''; searchEl.blur(); applyFilter(''); }
    else if (e.key === 'Enter')      { searchEl.blur(); openTab(); }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); searchEl.blur(); go(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); searchEl.blur(); go(1); }
    return;
  }

  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undoClose(); return; }

  if (e.key === 'ArrowDown' && viewMode === 'main' && filtered[active]?.type === 'group') {
    e.preventDefault(); enterGroup(filtered[active]); return;
  }
  if (e.key === 'ArrowUp' && viewMode === 'group') {
    e.preventDefault(); exitGroup(); return;
  }

  switch (e.key) {
    case 'ArrowLeft':  e.preventDefault(); go(-1); break;
    case 'ArrowRight': e.preventDefault(); go(1);  break;
    case 'Enter':
      e.preventDefault();
      if (filtered[active]?.type === 'group') enterGroup(filtered[active]);
      else openTab();
      break;
    case 'Escape':
      e.preventDefault();
      closeActiveTab();
      break;
    case '/': e.preventDefault(); searchEl.focus(); break;
  }
});

// ── Search / filter ───────────────────────────────────────────────────────────
function applyFilter(q) {
  const query  = q.toLowerCase().trim();
  const source = viewMode === 'group' ? activeGroup.tabs : mainItems;
  filtered = query
    ? source.filter(t =>
        t.type === 'group'
          ? t.title.toLowerCase().includes(query)
          : t.title.toLowerCase().includes(query) || t.domain.toLowerCase().includes(query))
    : [...source];
  active = 0;
  buildCards();
}

searchEl.addEventListener('input', e => applyFilter(e.target.value));

// ── Trackpad / mouse-wheel ────────────────────────────────────────────────────
let wheelLock = false;
document.addEventListener('wheel', e => {
  if (wheelLock || document.activeElement === searchEl) return;
  wheelLock = true;
  setTimeout(() => { wheelLock = false; }, 290);
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  go(delta > 0 ? 1 : -1);
}, { passive: true });

// ── Drag-to-close ─────────────────────────────────────────────────────────────
const DRAG_CLOSE = 85;
const drag = { on: false, idx: -1, x0: 0, y0: 0, base: null, moved: false };

function initDrag(e, idx) {
  if (e.button !== undefined && e.button !== 0) return;
  e.preventDefault();
  const p    = e.touches ? e.touches[0] : e;
  drag.on    = true;
  drag.idx   = idx;
  drag.x0    = p.clientX;
  drag.y0    = p.clientY;
  drag.base  = getPos(idx - active);
  drag.moved = false;
  const card = cardEls[idx];
  card.style.transition = 'border-color 0.15s ease, box-shadow 0.15s ease';
  card.style.zIndex = '200';
}

function moveDrag(e) {
  if (!drag.on) return;
  const p  = e.touches ? e.touches[0] : e;
  const dx = p.clientX - drag.x0;
  const dy = p.clientY - drag.y0;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 4) drag.moved = true;
  if (!drag.moved) return;
  if (e.cancelable) e.preventDefault();

  const { tx, tz, ry, sc, op } = drag.base;
  const card = cardEls[drag.idx];

  card.style.transform = [
    `translateX(${tx + dx}px)`,
    `translateY(${dy}px)`,
    `translateZ(${tz}px)`,
    `rotateY(${ry + dx * 0.02}deg)`,
    `rotateZ(${dx * 0.012}deg)`,
    `scale(${sc})`,
  ].join(' ');

  card.style.opacity = op * (1 - Math.min(1, dist / DRAG_CLOSE) * 0.35);
  card.classList.toggle('will-close', dist >= DRAG_CLOSE);
}

function endDrag(e) {
  if (!drag.on) return;
  drag.on = false;
  const p  = e.changedTouches ? e.changedTouches[0] : e;
  const dx = p.clientX - drag.x0;
  const dy = p.clientY - drag.y0;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const card = cardEls[drag.idx];
  card.classList.remove('will-close');

  if (drag.moved && dist >= DRAG_CLOSE) {
    poofClose(drag.idx, card, dx, dy);
  } else {
    card.style.zIndex     = '';
    card.style.transition = '';
    updatePositions();
  }
}

function poofClose(idx, card, dx, dy) {
  const tab = filtered[idx]; // capture by identity before any async delay
  const { tx, tz, ry } = drag.base;
  card.style.transition = 'transform 0.22s cubic-bezier(0.4, 0, 1, 1), opacity 0.18s ease';
  card.style.transform  = [
    `translateX(${tx + dx * 1.5}px)`,
    `translateY(${dy * 1.5}px)`,
    `translateZ(${tz}px)`,
    `rotateY(${ry}deg)`,
    `rotateZ(${dx * 0.03}deg)`,
    `scale(0.05)`,
  ].join(' ');
  card.style.opacity = '0';

  setTimeout(() => {
    const currentIdx = filtered.findIndex(t => t.id === tab.id);
    if (currentIdx === -1) return; // already removed by a concurrent close
    removeTabFromModels(tab, currentIdx);

    // Actually close the Chrome tab
    chrome.tabs.remove(tab.id);
    showUndoToast(tab.title);

    if (currentIdx < active)       active = active - 1;
    else if (currentIdx === active) active = Math.min(active, Math.max(0, filtered.length - 1));
    // idx > active: right-side deletion, centre card unaffected

    buildCards();
  }, 230);
}

document.addEventListener('mousemove', moveDrag);
document.addEventListener('mouseup',   endDrag);
document.addEventListener('touchmove', moveDrag, { passive: false });
document.addEventListener('touchend',  endDrag);

// ── Init: load real Chrome tabs + tab groups ──────────────────────────────────
async function init() {
  const [allChromeTabs, activeTabs, allGroups] = await Promise.all([
    new Promise(r => chrome.tabs.query({ currentWindow: true }, r)),
    new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r)),
    new Promise(r => chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }, r)),
  ]);

  // Filter the TabFlow page itself out of the tab list
  const selfUrl = chrome.runtime.getURL('newtab.html');

  // Build flat tab list with groupId
  allTabs = allChromeTabs
    .filter(tab => tab.url !== selfUrl)
    .map(tab => ({
      type:       'tab',
      id:         tab.id,
      windowId:   tab.windowId,
      title:      tab.title || 'New Tab',
      domain:     getDomain(tab.url),
      url:        tab.url || '',
      favIconUrl: tab.favIconUrl || '',
      groupId:    tab.groupId,
    }));

  // Build group objects keyed by id
  const groupMap = {};
  allGroups.forEach(g => {
    groupMap[g.id] = {
      type:  'group',
      id:    g.id,
      title: g.title || 'Tab Group',
      color: g.color,
      tabs:  [],
    };
  });

  // Assign tabs to their groups
  allTabs.forEach(tab => {
    if (tab.groupId !== -1 && groupMap[tab.groupId]) {
      groupMap[tab.groupId].tabs.push(tab);
    }
  });

  // Build mainItems preserving Chrome tab order:
  // ungrouped tabs appear individually; grouped tabs appear as one group card (first occurrence)
  const seenGroups = new Set();
  mainItems = [];
  allChromeTabs
    .filter(tab => tab.url !== selfUrl)
    .forEach(tab => {
      if (tab.groupId === -1) {
        const tabObj = allTabs.find(t => t.id === tab.id);
        if (tabObj) mainItems.push(tabObj);
      } else if (!seenGroups.has(tab.groupId) && groupMap[tab.groupId]) {
        seenGroups.add(tab.groupId);
        mainItems.push(groupMap[tab.groupId]);
      }
    });

  // Reset to main view
  viewMode    = 'main';
  activeGroup = null;
  if (hintExitGroupEl) hintExitGroupEl.style.display = 'none';
  filtered = [...mainItems];

  // Centre on whichever tab (or its group card) is currently active
  const currentTab = activeTabs[0];
  if (currentTab) {
    const idx = mainItems.findIndex(item =>
      item.type === 'tab'
        ? item.id === currentTab.id
        : item.tabs.some(t => t.id === currentTab.id)
    );
    active = idx >= 0 ? idx : 0;
  } else {
    active = 0;
  }

  buildCards();
}

init();
