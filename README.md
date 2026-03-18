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
- Pin prompts per conversation
- Prompt version / branch navigation for Pro users
- Lightweight Pro entitlement flow

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
- pin prompts
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
│   │   ├── entitlement/
│   │   ├── storage/
│   │   ├── ui/
│   │   └── util/
│   └── vite.config.ts
├── navgpt-license-proxy
│   └── src/index.ts
└── README.md
```

## Project overview

### Extension content app

The content script mounts a shadow-DOM sidebar into ChatGPT and renders the Preact application.

### DOM integration

The extension identifies the active thread, scrapes user prompts, detects edit/version controls, and keeps the sidebar in sync with ChatGPT’s single-page-app navigation.

### Background worker

An MV3 service worker manages entitlement state, trial bootstrapping, and recurring license validation.

### License proxy

A small Cloudflare Worker proxies Lemon Squeezy license requests.

## Installation

### Requirements

- Node.js

- npm

- Chrome or another Chromium-based browser

### Install dependencies

```
cd extension
npm install
```

### Build the extension

```
npm run build
```

### Build a distributable zip

```
npm run build:zip
```

### Load into Chrome

1. Open chrome://extensions

2. Enable Developer Mode

3. Click Load unpacked

4. Select extension/dist

### Proxy

```bash
cd navgpt-license-proxy
npm install
npx wrangler deploy
```

## Available scripts

```
npm run dev
npm run build
npm run build:zip
npm run preview
```

## Manifest notes

NavGPT uses Manifest V3.

Current permissions:

- storage

- alarms

Host permissions:

- https://chatgpt.com/*

- https://navgpt-license-proxy.navgpt.workers.dev/*

## Development notes

The most important files for day-to-day work are:

- `extension/src/content/App.tsx`

- `extension/src/dom/scrape.ts`

- `extension/src/dom/selectors.ts`

- `extension/src/dom/page.ts`

- `extension/src/ui/Sidebar.tsx`

- `extension/src/storage/promptMeta.ts`

- `extension/src/background.ts`

For a deeper technical breakdown, see `ARCHITECTURE.md`

## Testing Scenarios

| Scenario                  | Expected Result                          |
| ------------------------- | ---------------------------------------- |
| Fresh install             | Trial active                             |
| Activate valid key        | Pro unlocked, activation count increases |
| Deactivate Pro            | removed, activation count decreases      |
| Expired                   | subscription Pro locked                  |
| Offline during validation | Grace allows temporary access            |

### Enable Performance Debug Logging

Performance logs for `observePrompts()` are disabled by default.

To enable:

1. Open the app in your browser.
2. Open DevTools → Console.
3. Run:

```js
localStorage.setItem('navgpt_debug_perf', '1')
```

4. Refresh the page

You'll see logs like:
`[NavGPT perf] { ... }`

To disable:
`localStorage.removeItem('navgpt_debug_perf')`

or

`localStorage.setItem('navgpt_debug_perf', '0')`

## 📜 License

Proprietary — NavGPT © 2026
