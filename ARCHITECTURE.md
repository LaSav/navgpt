# NavGPT Architecture

This document explains how NavGPT is structured internally and how to work on it safely.

It is written for future development, especially AI-assisted development inside a ChatGPT project.

---

## Purpose

NavGPT is designed to:

- inject a sidebar into ChatGPT
- build a prompt-history model from the active thread
- support navigation between prompts and prompt versions
- persist lightweight prompt metadata
- handle Pro entitlement cleanly in a Manifest V3 extension

The core constraint behind the design is simple:

> ChatGPT does not provide a stable extension-facing API for this functionality, so NavGPT relies on defensive DOM integration.

---

## System overview

NavGPT consists of two runtime systems.

### 1. Chrome extension

Located in `/extension`

Responsible for:

- content script startup
- sidebar mounting
- prompt scraping
- thread observation
- navigation actions
- storage-backed prompt metadata
- entitlement-aware UI
- background service worker logic

### 2. License proxy

Located in `/navgpt-license-proxy`

Responsible for:

- proxying activate / validate / deactivate requests
- handling CORS for extension traffic
- basic rate limiting
- forwarding to Lemon Squeezy
- removing some customer metadata from responses

---

## Runtime flow

### 1. Content entrypoint

File: `extension/src/content.tsx`

Responsibilities:

- capture and scrub incoming license state if present
- wait for DOM readiness
- call `startContentApp()`

This is the extension’s content-script entrypoint.

---

### 2. Bootstrap

File: `extension/src/content/bootstrap.tsx`

Responsibilities:

- create the sidebar mount host
- attach shadow DOM
- attach theme sync
- load the extension stylesheet into the shadow root
- render `<App />`

This is where the extension UI becomes active on the page.

---

### 3. Mounting

File: `extension/src/content/mount.ts`

Responsibilities:

- create a fixed sidebar host element
- prevent duplicate mounts
- attach an open shadow root
- load `assets/styles.css` into shadow DOM

This keeps the extension UI visually isolated from ChatGPT.

---

### 4. App orchestration

File: `extension/src/content/App.tsx`

This is the main coordination layer.

Responsibilities:

- scrape prompts from the active thread
- observe prompt and thread changes
- merge stored prompt metadata into scraped items
- track the active prompt
- determine whether the sidebar should render
- handle prompt actions:
  - jump
  - edit
  - copy
  - pin / unpin
  - version navigation
- apply Pro gating
- keep UI and page state in sync

If you are new to the project, this is the best high-level entrypoint.

---

## Core data model

### `PromptItem`

Defined in `extension/src/dom/scrape.ts`

A `PromptItem` is NavGPT’s in-memory representation of a user prompt turn in the active ChatGPT thread.

Fields:

- `id` — stable sidebar item id
- `text` — summarized display text
- `rawText` — full prompt text
- `el` — DOM element used for scrolling and focus
- `edits` — detected number of edits
- `totalVersions` — detected version count
- `currentVersion` — active version index
- `isEditing` — whether the prompt is currently in edit mode
- `conversationId` — current conversation id from the URL
- `turnId` — turn id from the DOM if available

Important: this is a scraped model, not a ChatGPT API object.

---

## DOM integration model

### Selectors as the DOM contract

File: `extension/src/dom/selectors.ts`

This is the single most important maintenance file in the project.

Purpose:

- centralize brittle ChatGPT selectors
- keep logic files readable
- reduce breakage surface when ChatGPT markup changes

Selectors are grouped by intent:

- layout anchors
- thread roots
- turns and user turns
- editable surfaces
- edit buttons
- version navigation buttons
- revision counters
- sidebar host ids

### Rule of thumb

When ChatGPT changes its markup, update `dom/selectors.ts` first before changing higher-level logic.

---

## Page detection

File: `extension/src/dom/page.ts`

Purpose:

- determine what kind of page is currently open
- identify the active thread
- decide whether the sidebar should render

Main concepts:

- `getThreadLikeRoot()` — finds a thread-shaped container even if it has no turns yet
- `getActiveThread()` — finds a thread root that contains actual turns
- `pageKind()` — classifies the page as:
  - `chat`
  - `projects`
  - `unknown`
- `shouldShowSidebar()` — hides the sidebar on project pages and only shows it on chat pages

Current behavior:

- the sidebar is hidden on `/project...` paths
- the sidebar is shown only when the page looks like a chat page

---

## Conversation identity

File: `extension/src/dom/getConversationId.ts`

Purpose:

- derive the current conversation id from the URL

Current URL pattern:

```text
/c/:conversationId
```

This value is used for prompt metadata storage.

---

## Prompt scraping

File: `extension/src/dom/scrape.ts`

This is the core extraction layer.

Responsibilities:

- scrape prompt turns from the active thread only

- identify user turns

- normalize prompt text

- detect edit mode

- detect prompt revision/version information

- create stable item ids

- expose observePrompts() for reactive updates

### Important behaviors

#### Active-thread-only scraping

The scraper only works within the active thread root. It intentionally ignores the rest of the page.

This prevents contamination from:

- project pages

- landing pages

- surrounding layout

- unrelated thread-like UI

#### Editing-aware extraction

If a prompt is currently being edited, the scraper reads the textarea value instead of the rendered text.

#### Version detection

Version info comes from either:

- an explicit revision counter like 1 / 2

- previous / next response buttons as a fallback signal

#### Text normalization

Prompt text is trimmed, normalized to one line for display, and kept in full form as rawText.

---

## Observation model

There are two observation layers.

### 1. Coarse page and navigation watcher

File: `extension/src/dom/navigationWatcher.ts`

Purpose:

- respond to SPA navigation

- react to pushState, replaceState, popstate, and hashchange

- trigger sidebar visibility and page-state reevaluation

It also includes a lightweight top-level mutation fallback.

Think of this watcher as:

> “The page or route may have changed.”

It does not do prompt-level scraping itself.

### 2. Prompt observer

File: `extension/src/dom/scrape.ts` → `observePrompts()`

Purpose:

- watch the active thread for meaningful prompt changes

- debounce update emission

- rebind when thread roots change

- avoid noisy updates while typing

### Important details:

- binds a MutationObserver to the current thread root

- rebinds when structure changes

- waits briefly for hydration and settling

- pauses mutation-driven scraping while the active editor is focused

- schedules a refresh after focus leaves an editor

- deduplicates updates using a lightweight signature

This is a key UX detail: prompt text should not flicker or update aggressively while the user edits a prompt.

---

## UI architecture

### Sidebar

File: `extension/src/ui/Sidebar.tsx`

The sidebar has two views:

- `history`

- `settings`

#### History view

Displays the prompt list and exposes actions:

- jump to prompt

- copy prompt

- edit prompt

- pin / unpin prompt

- navigate previous / next prompt

- navigate previous / next version

- show active state

- show locked Pro affordances for gated features

#### Settings view

Hosts entitlement-related UI via `ProPanel`.

#### Keyboard behavior

While in history view:

- `Alt + ArrowUp` → previous prompt

- `Alt + ArrowDown` → next prompt

---

## Prompt metadata persistence

File: `extension/src/storage/promptMeta.ts`

Prompt metadata is stored in `chrome.storage.local`.

Storage model:

```ts
type PromptMeta = {
  pinned?: boolean
  note?: string
  updatedAt: number
}

type ConversationState = {
  prompts: Record<string, PromptMeta>
  updatedAt: number
}

type PersistedState = {
  conversations: Record<string, ConversationState>
}
```

Current metadata surfaced in the UI:

- `pinned`

Metadata supported by the storage model but not yet fully surfaced:

- `note`

### Design notes

- input is normalized before use

- empty metadata is removed

- empty conversations are pruned

- writes clone state instead of mutating loaded storage directly

- pinning is keyed by conversationId + turnId

This keeps storage compact and resilient to partial or old data.

---

## Entitlement architecture

There are two layers.

### 1. UI and content-side entitlement usage

Used in `App.tsx` and the sidebar to determine:

- whether all prompts are visible

- whether version navigation is available

- whether locked affordances or upgrade toasts should be shown

Free users currently see only the last N prompts and cannot use branch or version navigation.

### 2. Background entitlement control plane

File: `extension/src/background.ts`

Responsibilities:

- ensure trial state on install

- ensure instance name exists

- schedule recurring validation via chrome.alarms

- answer runtime messages from UI and content scripts

- deduplicate in-flight activation and validation requests

- broadcast entitlement changes when meaningful state changes occur

Supported message families include:

- `NAVGPT_ENSURE_TRIAL`

- `NAVGPT_GET_STATE`

- `NAVGPT_VALIDATE`

- `NAVGPT_ACTIVATE`

- `NAVGPT_DEACTIVATE`

Important MV3 note:

> Service workers are ephemeral, so durable entitlement state must live in storage.

---

## License proxy architecture

File: `navgpt-license-proxy/src/index.ts`

The Cloudflare Worker exposes 3 routes:

- `/activate`

- `/validate`

- `/deactivate`

Responsibilities:

- CORS handling

- POST-only API surface

- lightweight per-IP rate limiting

- form-encoding requests for Lemon Squeezy

- forwarding upstream status codes

- stripping some meta.customer\_\* fields from responses

This keeps the client extension simpler and avoids embedding direct Lemon Squeezy request behavior throughout the extension.

---

## Build architecture

### Extension build

File: `extension/package.json`

The current build is split into:

- `vite build` for the content-side app

- `esbuild` for the background worker

Scripts:

```json
{
  "dev": "vite",
  "build:vite": "vite build",
  "build:bg": "esbuild src/background.ts --bundle --format=iife --platform=browser --outfile=dist/assets/background.js",
  "build": "npm run build:vite && npm run build:bg",
  "build:zip": "npm run build && cd dist && zip -r ../navgpt-extension.zip ."
}
```

### Manifest

File: `extension/public/manifest.json`

Key points:

- Manifest V3

- content script runs on https://chatgpt.com/*

- background service worker is assets/background.js

- stylesheet is exposed as a web-accessible resource

- permissions:
  - storage

  - alarms

---

## File responsibility map

### Content lifecycle

- `src/content.tsx` — content script entrypoint

- `src/content/bootstrap.tsx` — mount, bootstrap, and render

- `src/content/mount.ts` — host, shadow root, and stylesheet loading

### App orchestration

- `src/content/App.tsx` — main extension coordination logic

### DOM integration

- `src/dom/selectors.ts` — ChatGPT DOM contract

- `src/dom/page.ts` — page kind and active thread detection

- `src/dom/scrape.ts` — prompt extraction and prompt observation

- `src/dom/navigationWatcher.ts` — SPA navigation watching

- `src/dom/layout.ts` — layout padding target detection

- `src/dom/getConversationId.ts` — URL-based conversation id parsing

### Persistence

src/storage/promptMeta.ts — prompt metadata storage and normalization

### UI

- `src/ui/Sidebar.tsx` — main sidebar UI

- `src/ui/ProPanel.tsx` — settings and Pro panel

- `src/ui/Toast.tsx` — transient toast UI

- `src/ui/Tooltip.tsx` — tooltip affordances

### Background / entitlement

- `src/background.ts` — MV3 service worker

- `src/entitlement/*` — entitlement implementation details

### Backend

- `navgpt-license-proxy/src/index.ts` — Lemon Squeezy proxy worker

---

## Safe modification guidelines

These rules should be preserved unless there is a deliberate architecture change.

### 1. Keep selectors centralized

Do not scatter new ChatGPT selectors across the app. Add them to dom/selectors.ts.

### 2. Scrape only the active thread

Do not broaden scraping to the entire page.

### 3. Avoid live mutation churn while typing

Do not reintroduce aggressive rescans while an editor is focused.

### 4. Prefer stable attributes over classes

Use data-testid, aria-label, and semantic anchors before class names.

### 5. Keep the sidebar shadow-isolated

Do not move the UI out of shadow DOM unless there is a strong reason.

### 6. Preserve MV3 assumptions

Do not depend on background worker memory for durable state.

---

## Maintenance hotspots

These files are the most likely to require updates when ChatGPT changes:

- `src/dom/selectors.ts`

- `src/dom/scrape.ts`

- `src/dom/page.ts`

- `src/dom/layout.ts`

Typical symptoms of DOM breakage:

- `sidebar no longer appears`

- `prompts are missing`

- `edit action stops working`

- `version navigation stops appearing`

- `wrong thread is scraped`

- `layout overlap returns`

The usual first response should be:

1. inspect ChatGPT markup

2. update selectors

3. verify active-thread detection

4. verify scrape assumptions

---

## Working with this project in ChatGPT

For future AI-assisted work, provide the relevant files with the task.

If the issue is “prompts are wrong”

Include:

- `src/dom/selectors.ts`

- `src/dom/scrape.ts`

- `src/dom/page.ts`

- `src/content/App.tsx`

### If the issue is “sidebar UI needs changes”

Include:

- `src/ui/Sidebar.tsx`

- `src/content/App.tsx`

- `public/assets/styles.css`

### If the issue is “pinning or storage is wrong”

Include:

- `src/storage/promptMeta.ts`

- `src/content/App.tsx`

### If the issue is “Pro or license flow is wrong”

Include:

- `src/background.ts`

- `src/entitlement/*`

- `navgpt-license-proxy/src/index.ts`

### Good constraints to specify

- preserve MV3 compatibility

- do not scrape outside the active thread

- keep selectors centralized

- avoid live rescans while typing

- prefer stable attributes

- preserve shadow DOM isolation
