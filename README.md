# TabFlow

A Chrome extension that brings Cover Flow to your browser tabs — navigate all your open tabs in a beautiful 3D carousel, keyboard-first.

---

## Features

- **Cover Flow carousel** — tabs arranged in a 3D perspective view, just like the original iTunes/iPhone Cover Flow
- **Tab groups** — Chrome tab groups appear as a single card with floating favicons; drill into a group with `↓` and return with `↑`
- **Keyboard-first** — navigate entirely without the mouse using arrow keys, Enter, Escape, and `/` for search
- **Drag to close** — drag any card out of the row to close that tab with a satisfying poof animation
- **Undo close** — accidentally closed a tab? Press `⌘Z` (or click the toast) to restore it instantly
- **Search / filter** — press `/` and type to filter tabs by title or domain; search is scoped to the current group when inside one
- **Full-page view** — opens as a new tab for maximum space, not a tiny popup
- **Favicon-first cards** — uses each site's favicon as the card hero with automatic fallback to the Google favicon service
- **Always centred** — opens with your currently active tab in the centre of the carousel

---

## Keyboard Shortcuts

| Key                          | Action                                   |
| ---------------------------- | ---------------------------------------- |
| `⌘⇧.` / `Ctrl+Shift+.`       | Open TabFlow (global shortcut)           |
| `←` / `→`                    | Navigate carousel                        |
| `↓`                          | Enter a tab group                        |
| `↑`                          | Exit a tab group back to main view       |
| `↵` Enter                    | Open the selected tab (or enter a group) |
| `Esc`                        | Close the active tab                     |
| `/`                          | Focus search                             |
| `⌘Z` / `Ctrl+Z`              | Undo last closed tab                     |

> **Customise the shortcut:** `chrome://extensions/shortcuts` — Chrome lets you remap it to anything you prefer.

---

## Installation

TabFlow is not yet published to the Chrome Web Store. Install it as an unpacked extension:

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the `tab-flow` folder

The TabFlow icon will appear in your toolbar. Click it to open the carousel.

> **First launch:** Chrome will ask you to approve the permissions `tabs`, `windows`, `sessions`, and `tabGroups`. These are the minimum required to read, switch, close, and restore tabs.

---

## Generating Icons

The icons need to be generated once before the extension works:

1. Open `icons/generate.html` in any browser (drag the file into a tab)
2. Click **Download All Icons**
3. Move the three downloaded PNGs (`icon16.png`, `icon48.png`, `icon128.png`) into the `icons/` folder

---

## Project Structure

```
tab-flow/
├── manifest.json       Chrome Extension Manifest V3
├── background.js       Service worker — handles toolbar icon click
├── newtab.html         Full-page UI (primary interface)
├── newtab.css          All styles
├── models.js           Pure data model layer — no DOM, no Chrome API
├── newtab.js           All UI logic — Cover Flow, tab groups, search, drag
└── icons/
    ├── generate.html   Open in browser to generate PNG icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Permissions

| Permission  | Why it's needed                                        |
| ----------- | ------------------------------------------------------ |
| `tabs`      | Read tab titles, URLs, favicons; switch and close tabs |
| `windows`   | Focus the correct window when switching to a tab       |
| `sessions`  | Restore the most recently closed tab (undo)            |
| `tabGroups` | Read Chrome tab group names and colors                 |

---

## Development

No build step — it's plain HTML, CSS, and JavaScript. Edit any file and click **Reload** on the extension card in `chrome://extensions`.

## How It Works — Full Technical Reference

- [How It Works](how-it-works.md)

---

## License

MIT — see [LICENSE](LICENSE).
