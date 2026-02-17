# NavGPT — Smart Sidebar for ChatGPT

NavGPT is a Chrome extension that adds a powerful side panel to ChatGPT, allowing you to:

- Instantly jump between prompts in long conversations
- Copy or edit previous prompts
- Navigate alternative response branches
- Manage your NavGPT Pro license

Built with **Manifest V3**, **Preact**, and **Vite**.

---

## 🧱 Project Structure

extension/ # Chrome extension
src/
content.tsx # Injected UI + sidebar logic
background.ts # Service worker (licensing, alarms, messaging)
dom/ # ChatGPT DOM scraping + observers
ui/ # Sidebar + ProPanel components
entitlement/ # Licensing & trial logic
util/ # Small helpers

navgpt-license-proxy/ # Cloudflare Worker
src/index.ts # Secure proxy for Lemon Squeezy license API

---

## ✨ Features

### Sidebar Navigation

- Lists all user prompts in the current ChatGPT thread
- Jump, copy, or edit prompts instantly
- Keyboard-style navigation through prompts

### Pro Features

- Edit prompts directly from sidebar
- Navigate response branches
- Increased daily action limits

---

## 🔐 Licensing Model

NavGPT Pro uses **device-based license activation** via Lemon Squeezy.

### How It Works

| State                  | Meaning                                                   |
| ---------------------- | --------------------------------------------------------- |
| **Trial**              | Free trial period after install                           |
| **Pro (Active)**       | License activated on this device                          |
| **Inactive**           | Valid key, but not activated anywhere (no Pro access)     |
| **Grace**              | Temporary offline allowance after a successful validation |
| **Expired / Disabled** | Subscription inactive or revoked                          |

### Activation

When a user enters a license key and presses **Activate**:

1. The extension requests activation via a secure proxy
2. Lemon Squeezy assigns an **instance ID** (counts toward activation limit)
3. The extension validates the license
4. Pro features unlock

### Deactivation

Users can deactivate this device:

- The extension calls Lemon’s `/deactivate` endpoint
- The device activation is released
- Pro access is removed
- Activation UI reappears

---

## 🔄 License Validation

Validation runs in two ways:

### Automatic (Background)

- The service worker wakes periodically
- If validation is due, it checks with the licensing server
- Maintains grace period for temporary outages

### Manual (User)

- Users can press **Refresh Status**
- Forces a real-time validation

---

## 🖥️ Extension Architecture

| Layer                  | Responsibility                       |
| ---------------------- | ------------------------------------ |
| **Content Script**     | Injects sidebar UI into ChatGPT      |
| **Background Worker**  | Handles licensing, storage, alarms   |
| **Entitlement Module** | Business logic for trial, pro, grace |
| **Proxy (Cloudflare)** | Secure bridge to Lemon Squeezy       |

---

## ☁️ License Proxy

The proxy prevents exposing API keys in the extension.

Supported routes:

| Route         | Purpose                        |
| ------------- | ------------------------------ |
| `/activate`   | Activate a license on a device |
| `/validate`   | Validate a license key         |
| `/deactivate` | Remove device activation       |

---

## 🛠 Development

### Extension

```bash
cd extension
npm install
npm run build
```

Load unpacked from Chrome → `chrome://extensions`

### Proxy

```bash
cd navgpt-license-proxy
npm install
npx wrangler deploy
```

## 🧪 Testing Scenarios

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
