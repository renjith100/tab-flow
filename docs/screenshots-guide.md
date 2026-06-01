# Capturing Chrome Web Store screenshots (TabFlow)

Target size: **1280×800 PNG** (the Web Store's preferred slot), up to 5 images.
This guide captures the real, loaded extension. (For staged states that are hard
to reproduce with real tabs — e.g. a red "stale" pill — a demo harness is the
easier route; ask if you want one.)

## One-time setup

1. Load the current build — reload the extension after merging, or **Load
   unpacked** `…/tab-flow`.
2. Stage a good window: ~25–40 tabs across **2 Chrome tab groups** plus some
   ungrouped, using recognizable sites (GitHub, Figma, YouTube, Gmail, docs…).
   More tabs → a fuller grid and a redder count badge.
3. Make triage states visible:
   - **Duplicates chip** → open the same URL in 2+ tabs.
   - **Audio bar** → start a YouTube/music tab playing.
   - **Stale pill (red)** → needs a tab untouched **7+ days**; can't be faked in a
     fresh session. Skip that shot, capture it later once a tab ages, or use the
     demo harness.

## Capture at exactly 1280×800 (DevTools — best for page shots)

Produces a pure 1280×800 PNG with **no browser chrome**:

1. Open the TabFlow tab → DevTools (`⌥⌘I`).
2. Toggle device toolbar (`⌘⇧M`).
3. Set **Responsive**, dimensions **1280 × 800**, **DPR = 1** (so the file is
   exactly 1280×800, not 2×).
4. Device-bar **⋮ menu → "Capture screenshot"** → saves a 1280×800 PNG.

Re-frame TabFlow between captures (toggle view, change a control, select cards),
then Capture again.

## The 5 shots

1. **Grid overview** — default Grid, count + triage chips visible, a few sections
   of cards. *(Capture)*
2. **Group + sort** — flip **Group → Domain**; age pills visible; sort control in
   view. *(Capture)*
3. **Multi-select** — ⌘-click 3–4 cards so the **"Close selected"** bar shows. *(Capture)*
4. **Cover Flow** — toggle to **≋ Cover Flow**. *(Capture)*
5. **Toolbar count badge** — see below (needs browser chrome).

## The badge shot (needs the toolbar)

DevTools device mode hides the toolbar icon, so capture the **window**:

- `⌘⇧4`, then `Space`, click the Chrome window → captures it with the badge.
- Not exactly 1280×800 → open in Preview → **Tools → Adjust Size → 1280×800**
  (or crop), export PNG.

## Tips

- Hide the bookmarks bar (`⌘⇧B`); close stray DevTools panels before capturing.
- TabFlow is dark — a clean, dark window looks best; avoid personal tab titles you
  don't want public.
- Lead with **shot 1** (it becomes the listing thumbnail).
- See `docs/store-listing-2.0.0.md` for the description / "What's new" copy.
