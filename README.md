<div align="center">

# TabFlow

A beautiful, full-page tab manager for Chrome
See every tab at a glance, decide what to close, and clear the clutter — a visual Overview grid plus the classic Cover Flow carousel. Keyboard-first, no screenshots.

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Install-blue?logo=google-chrome&style=for-the-badge)](https://chromewebstore.google.com/detail/tabflow/lekecebmffemmgemgpmplpekbahbghno)

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3)

Watch the demo:

[![Demo video](https://img.youtube.com/vi/6c_-F-O46zg/0.jpg)](https://youtu.be/6c_-F-O46zg)

</div>

## Features

**Two views, one keystroke apart** — switch anytime; your choice is remembered.

### Overview grid (new default)

- Every tab across all windows as cards, grouped into sections
- Group ungrouped tabs by **window** or **domain**; sort by **recent / oldest / name**
- **Relative-age pill** on each card, color-coded fresh → stale; **audio bar** on tabs playing sound
- **Triage chips** — close all stale (7+ days untouched) or merge duplicates in one click
- **Multi-select** → bulk close, or promote a selection into a real Chrome tab group
- Live **tab-count badge** on the toolbar icon, color-escalating as tabs pile up

### Cover Flow carousel

- 3D, full-page animated tab switcher
- Tab Groups as stacked cards with floating favicons; ↓/↑ to drill in/out
- Drag to close with a poof animation

**Everywhere**

- Keyboard-first — arrows, search (`/`), Enter to switch, Esc/Del to close
- Undo (⌘Z) restores recently closed tabs, including bulk closes
- No data leaves your machine

## Installation

Easiest way — install directly from the Chrome Web Store:

[→ Add to Chrome ←](https://chromewebstore.google.com/detail/tabflow/lekecebmffemmgemgpmplpekbahbghno)

For development / sideloading:

1. Clone the repo: `git clone https://github.com/renjith100/tab-flow.git`

2. Open Chrome → go to `chrome://extensions/`

3. Enable Developer mode (top right)

4. Click **Load unpacked** → select the cloned folder

5. (Optional) Generate icons if needed: open `icons/generate.html` in Chrome

Default shortcut: `⌘⇧.` (Mac) / `Ctrl+Shift+.` (Windows/Linux)
You can change it in `chrome://extensions/shortcuts`

## How It Works

See [how-it-works.md](how-it-works.md) for UI/keyboard details and architecture notes.

## Permissions Explained

`tabs`, `windows`, `sessions`, `tabGroups` — only what's needed to read/manage tabs, groups, and undo closes. No network, storage, or host permissions.

## Privacy

No data collected or sent anywhere. See [PRIVACY.md](PRIVACY.md).

## Contributing

Early stage — welcome issues, feature requests, PRs!

Ideas: opt-in rich previews (OG image + description), saved tab stashes, more triage signals.

## License

MIT © Renjith Abraham

Star if you find it useful!
