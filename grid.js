// ── grid.js — DOM rendering for the Overview grid ─────────────────────────────
// Pure rendering. Business logic lives in triage.js; data is passed in.
// Relies on globals from newtab.js: favUrl(), getDomain(), makeFallback().

// Group color → hex, mirrors GROUP_COLORS in newtab.js for the section dot.
const GRID_GROUP_COLORS = {
  grey: '#9ca3af', gray: '#9ca3af', blue: '#60a5fa', red: '#f87171',
  yellow: '#fbbf24', green: '#34d399', pink: '#f472b6',
  purple: '#c084fc', cyan: '#22d3ee',
};

// Build the image banner: OG image if present (handled in OG plan),
// else favicon centered on a soft gradient.
function buildCardBanner(card) {
  const banner = document.createElement('div');
  banner.className = 'grid-card-image';

  if (card.image) {
    const img = document.createElement('img');
    img.className = 'gci-og';
    img.src = card.image;
    img.loading = 'lazy';
    img.onerror = () => { banner.classList.add('is-fallback'); img.remove(); fillFavicon(banner, card); };
    banner.appendChild(img);
  } else {
    banner.classList.add('is-fallback');
    fillFavicon(banner, card);
  }
  return banner;
}

function fillFavicon(banner, card) {
  const url = favUrl({ favIconUrl: card.favIconUrl, url: card.url });
  if (url) {
    const fav = document.createElement('img');
    fav.className = 'gci-fav';
    fav.src = url;
    fav.onerror = () => { fav.replaceWith(makeFallback(card.domain)); };
    banner.appendChild(fav);
  } else {
    banner.appendChild(makeFallback(card.domain));
  }
}

// One tab card.
function buildGridCard(card, ctx) {
  const el = document.createElement('article');
  el.className = 'grid-card';
  el.dataset.tabId = card.id;
  if (card.stale) el.classList.add('is-stale');
  if (ctx.isSelected(card.id)) el.classList.add('is-selected');

  const banner = buildCardBanner(card);
  if (card.ageLabel) {
    const pill = document.createElement('div');
    pill.className = card.stale ? 'gc-age-pill is-stale-age' : 'gc-age-pill';
    pill.textContent = card.stale ? `> ${card.ageLabel}` : card.ageLabel;
    if (!card.stale) {
      // Freshness gradient: bright green when just used → near-black by ~7 days.
      const f = card.freshness;                 // 1 = fresh, 0 = ~7d
      const sat   = Math.round(30 + 55 * f);    // 30%..85%
      const light = Math.round(5 + 37 * f);     // 5% (≈black) .. 42% (bright green)
      pill.style.background = `hsla(145, ${sat}%, ${light}%, .92)`;
      pill.style.borderColor = `hsla(145, ${sat}%, ${Math.min(light + 22, 72)}%, .6)`;
      pill.style.color = '#eafff1';
    }
    banner.appendChild(pill);
  }
  el.appendChild(banner);

  const close = document.createElement('button');
  close.className = 'gc-close';
  close.textContent = '×';
  close.title = 'Close tab';
  close.addEventListener('click', ev => { ev.stopPropagation(); ctx.onClose(card.id); });
  el.appendChild(close);

  const body = document.createElement('div');
  body.className = 'gc-body';

  const meta = document.createElement('div');
  meta.className = 'gc-meta';
  meta.textContent = card.domain;
  body.appendChild(meta);

  const title = document.createElement('div');
  title.className = 'gc-title';
  title.textContent = card.title;
  body.appendChild(title);

  if (card.description) {
    const desc = document.createElement('div');
    desc.className = 'gc-desc';
    desc.textContent = card.description;
    body.appendChild(desc);
  }

  el.appendChild(body);

  el.addEventListener('click', ev => {
    if (ev.metaKey || ev.ctrlKey) { ctx.onToggleSelect(card.id); return; }
    ctx.onOpen(card.id);
  });

  return el;
}

// One section: header (dot + label + count + close-section) and a flow of cards.
function buildSectionEl(section, ctx) {
  const el = document.createElement('section');
  el.className = 'grid-section';

  const header = document.createElement('div');
  header.className = 'gs-header';

  if (section.kind === 'group' && section.color) {
    const dot = document.createElement('span');
    dot.className = 'gs-dot';
    dot.style.background = GRID_GROUP_COLORS[section.color] || '#9ca3af';
    header.appendChild(dot);
  }

  const label = document.createElement('span');
  label.className = 'gs-label';
  label.textContent = section.label;
  header.appendChild(label);

  const count = document.createElement('span');
  count.className = 'gs-count';
  count.textContent = section.count;
  header.appendChild(count);

  const closeAll = document.createElement('button');
  closeAll.className = 'gs-closeall';
  closeAll.textContent = 'Close all';
  closeAll.addEventListener('click', () =>
    ctx.onCloseMany(section.cards.map(c => c.id)));
  header.appendChild(closeAll);

  el.appendChild(header);

  const flow = document.createElement('div');
  flow.className = 'grid-flow';
  for (const card of section.cards) flow.appendChild(buildGridCard(card, ctx));
  el.appendChild(flow);

  return el;
}

// Render all sections into the container.
function renderGrid(container, sections, ctx) {
  container.innerHTML = '';
  for (const section of sections) container.appendChild(buildSectionEl(section, ctx));
}
