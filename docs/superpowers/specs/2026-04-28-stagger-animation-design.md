# Staggered Card Reveal — Design Spec

**Date:** 2026-04-28
**Author:** Renjith + Claude
**Status:** Approved for implementation
**Predecessor:** `2026-04-28-filter-animation-design.md` (filter diff + group cross-fade)

## Goal

Replace the simultaneous "all cards reveal at once" visual with a center-out staggered reveal — the active card pops first, neighbors cascade outward — when cards re-enter the carousel after a filter clear or a group transition.

## Decisions (locked)

| | Value |
|---|---|
| Order | Center-out — active card first, distance from `active` drives delay |
| Scope | Filter enterers (after backspace) + group enter / exit |
| Stagger interval | 50ms per step of distance |
| Cap | ±5 from active. Cards beyond the cap are not seeded and not delayed. |
| Leavers | Unchanged (simultaneous fade-and-shrink) |
| Survivors | Unchanged (slide to new position with no delay) |
| Re-matches | No stagger. Snap back to target via existing transition. |
| Initial new-tab paint | Unchanged (still uses `updatePositions({ instant: true })`) |

## Mechanism

The existing `.card` rule has `transition: transform 0.4s, opacity 0.4s` (cubic-bezier(0.22, 1, 0.36, 1)). This already provides the fade-and-scale-up motion. The stagger is a per-card `transition-delay` set inline.

### Constants

```js
const STAGGER_MS  = 50;   // delay per step of distance from active
const STAGGER_CAP = 5;    // cards beyond ±5 don't stagger
```

### Helper

```js
// Returns a delay in ms for the card at `index`, or null if it should not
// stagger (and thus shouldn't be seeded).
function staggerDelayMs(index, activeIdx) {
  const distance = Math.abs(index - activeIdx);
  return distance > STAGGER_CAP ? null : distance * STAGGER_MS;
}
```

### Cleanup

After the staggered reveal completes, every card's `transitionDelay` must be cleared — otherwise a later arrow-key press would inherit the delay and animate strangely. Total animation time = `STAGGER_CAP × STAGGER_MS + 400ms (transition)` = `650ms`. Schedule cleanup at `700ms` for a small buffer.

```js
function clearAllTransitionDelays() {
  cardEls.forEach(card => { card.style.transitionDelay = ''; });
}
```

## Filter case — `applyFilterDiff`

Add the seed-and-delay behavior to enterers; clear leftover delays on survivors and re-matches.

For each item in `newFiltered`:

- **Re-match:** clear `is-leaving`, clear opacity, **clear `transitionDelay`**. Push to `newCardEls`. (No new delay — they snap back via the existing transition.)
- **Survivor:** clear `transitionDelay` (in case it has stale residue from a prior stagger). Push to `newCardEls`.
- **Enterer:** create card. Compute its position in the resulting `newCardEls` array. Compute `delay = staggerDelayMs(position, 0)` (after diff, `active` becomes `0`). If `delay !== null`, seed at `opacity:0; scale(0.6)` and set `transitionDelay = ${delay}ms`. If `delay === null`, do **not** seed — the card is beyond the cap, so its target opacity is 0 anyway via `updatePositions`'s `far` check (`Math.abs(offset) > 4`).

After `cardEls = newCardEls; filtered = newFiltered; active = 0;` is committed:

- Force reflow if any enterer was seeded.
- Call `updatePositions()` (animated).
- Schedule `clearAllTransitionDelays` via `setTimeout` after `700ms`.

## Group transition case — `buildCards({ stagger: true })`

`buildCards` accepts an option flag. Default is unchanged.

```js
function buildCards({ stagger = false } = {}) {
  cardsEl.innerHTML = '';
  cardEls = [];

  if (filtered.length === 0) {
    // existing empty-state branch — unchanged
    return;
  }
  emptyEl.classList.remove('show');

  filtered.forEach((item, i) => {
    const card = createCardElement(item);
    if (stagger) {
      const delay = staggerDelayMs(i, active);
      if (delay !== null) {
        card.style.opacity = '0';
        card.style.transform = 'scale(0.6)';
        card.style.transitionDelay = `${delay}ms`;
      }
    }
    cardsEl.appendChild(card);
    cardEls.push(card);
  });

  if (stagger) {
    void cardsEl.offsetHeight;       // commit seeded values
    updatePositions();               // animated reveal
    setTimeout(clearAllTransitionDelays, 700);
  } else {
    updatePositions({ instant: true });
  }
}
```

`enterGroup` and `exitGroup` switch their inner `buildCards()` calls to `buildCards({ stagger: true })`.

## Cross-fade adjustment

Currently `crossFade` does:
1. Fade `cardsEl` 1 → 0 (180ms).
2. `swapFn()` (calls `buildCards()` with instant positioning).
3. Fade `cardsEl` 0 → 1 (180ms).

With the staggered reveal driving the fade-in, step 3 becomes immediate:

```js
function crossFade(swapFn) {
  cardsEl.style.transition = 'opacity 0.18s ease';
  cardsEl.style.opacity = '0';
  setTimeout(() => {
    swapFn();
    cardsEl.style.opacity = '1';   // immediate; cards drive the visible reveal
  }, 180);
}
```

The container is now fully opaque while the cards stagger in from `opacity:0`. No flash because old content was at opacity 0 from step 1, and new content is at individual opacity 0 until each card's `transition-delay` fires.

## Verification scenarios

1. **Filter — clear search:** type a partial query, then backspace. Previously-hidden cards reveal **center-out** — active card first, neighbors expand outward. Survivors slide to their new positions in parallel.
2. **Filter — partial change:** type `g`, then `gi`. The `gi` step has its own enterer animation (if any) and leaver animation. Re-matches if you backspace from `gi` to `g` snap back instantly with no stagger.
3. **Group enter:** click a group card. Cross-fade out (180ms) → staggered reveal of group's tabs from active outward.
4. **Group exit:** press `↑`. Cross-fade out → staggered reveal of main view, with the previously-entered group card popping first (it's the new `active`).
5. **Empty → enterers:** type a no-match query, then backspace. Cards stagger in from active outward.
6. **Carousel physics:** after the stagger completes, `← →` arrow nav glides cleanly with no inherited delay (cleanup works). Drag-to-close on a tab card behaves normally.
7. **Heavy tab count:** with 100+ tabs, only the ±5 window staggers — cards beyond the cap are invisible (already opacity 0 via `updatePositions`), so no perceived slowness.

## Risks

- **Cleanup race:** rapid typing triggers multiple `applyFilterDiff` calls before the 700ms cleanup runs. Mitigation: each diff explicitly clears `transitionDelay` on survivors and re-matches before reassigning. Enterers always get a fresh delay. Stale delays cannot persist across diffs.
- **Drag-to-close mid-stagger:** a tab card mid-stagger has `pointer-events: auto` (set by `updatePositions`). A drag could start partway through the reveal. Acceptable — same behavior class as starting a drag during `← →` navigation, which is already allowed.
- **`transitionDelay` leaking onto leavers:** when a card is reassigned to `is-leaving` later, any residual delay would push the leave animation back. Cleanup at 700ms covers normal cases. For safety, clear `transitionDelay` on leavers too at the moment they're tagged. *Implementation note:* trivial line in the leaver branch of `applyFilterDiff`.

## Non-goals

- Stagger leavers — leavers stay simultaneous.
- Stagger initial new-tab paint — first paint stays instant.
- Animate distance > ±5 — those cards are not visible in the carousel anyway.
- Make stagger configurable at runtime — constants are fine.

## File changes

- **Modify** `newtab.js`:
  - Add `STAGGER_MS`, `STAGGER_CAP` constants.
  - Add `staggerDelayMs(index, activeIdx)` helper.
  - Add `clearAllTransitionDelays()` helper.
  - Modify `buildCards` to accept `{ stagger }`.
  - Modify `applyFilterDiff` to seed/delay enterers, clear delays on survivors/re-matches/leavers, schedule cleanup.
  - Modify `crossFade` — drop the explicit fade-in, let the staggered reveal drive it.
  - Modify `enterGroup` and `exitGroup` to pass `{ stagger: true }` to `buildCards`.

- **No CSS changes.**
- **No HTML changes.**
