# NavGPT

NavGPT is a Chrome extension for ChatGPT that adds a dedicated sidebar for navigating prompts within a conversation, jumping between turns, revisiting edited versions, and managing prompt history more efficiently.

Built with:

- **Preact**
- **Vite**
- **Chrome Extension Manifest V3**

## Features

- Prompt history sidebar for the current conversation
- Fast navigation between prompts
- Jump directly to a prompt in the thread
- Copy prompt text
- Re-open prompts for editing
- Bookmark prompts per conversation
- Prompt version / branch navigation
- Export conversation to Markdown

## Why NavGPT exists

Long ChatGPT conversations become difficult to navigate, especially when prompts are edited, branched, or buried deep in a thread.

NavGPT improves that workflow by adding a prompt-focused navigation layer directly into the ChatGPT UI.

## How it works

NavGPT injects a sidebar into ChatGPT pages and builds a structured list of user prompts by scraping the active conversation thread.

From that sidebar, users can:

- browse prompt history
- jump to prompts
- edit existing prompts
- copy prompt text
- Bookmark prompts
- navigate versions where available

Because ChatGPT does not expose a stable public API for this kind of integration, NavGPT uses a defensive DOM-driven approach.

## Repository structure

```text
.
├── extension
│   ├── public
│   │   ├── assets/styles.css
│   │   ├── icons/
│   │   └── manifest.json
│   ├── src
│   │   ├── background.ts
│   │   ├── content.tsx
│   │   ├── content/
│   │   ├── dom/
│   │   ├── storage/
│   │   ├── ui/
│   │   └── util/
│   └── vite.config.ts
└── README.md
```

## Project overview

### Extension content app

The content script mounts a shadow-DOM sidebar into ChatGPT and renders the Preact application.

### DOM integration

The extension identifies the active thread, scrapes user prompts, detects edit/version controls, and keeps the sidebar in sync with ChatGPT's single-page-app navigation.

### Background worker

A minimal MV3 service worker stub. All durable state lives in `chrome.storage.local`.

## Installation

### Requirements

- Node.js
- npm
- Chrome or another Chromium-based browser

### Install dependencies

```bash
cd extension
npm install
```

### Build the extension

```bash
npm run build
```

### Build a distributable zip

```bash
npm run build:zip
```

### Load into Chrome

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click **Load unpacked**
4. Select `extension/dist`

## Available scripts

```bash
npm run dev        # Vite dev server (UI iteration only)
npm run build      # Full build
npm run build:zip  # Build + package into navgpt-extension.zip
```

## Manifest notes

NavGPT uses Manifest V3.

Permissions:

- `storage`

Host permissions:

- `https://chatgpt.com/*`

## Development notes

The most important files for day-to-day work are:

- `extension/src/content/App.tsx`
- `extension/src/dom/scrape.ts`
- `extension/src/dom/selectors.ts`
- `extension/src/dom/page.ts`
- `extension/src/ui/Sidebar.tsx`
- `extension/src/storage/promptMeta.ts`

For a deeper technical breakdown, see `ARCHITECTURE.md`.

### Enable Performance Debug Logging

Performance logs for `observePrompts()` are disabled by default.

To enable:

1. Open DevTools → Console
2. Run:

```js
localStorage.setItem('navgpt_debug_perf', '1')
```

3. Refresh the page

You'll see logs like: `[NavGPT perf] { ... }`

To disable:

```js
localStorage.removeItem('navgpt_debug_perf')
```

## License

MIT — see [LICENSE](./LICENSE)
