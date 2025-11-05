### Build & load

1. `pnpm i` (or `npm i`, `yarn`)
2. `pnpm build`
3. Load `dist/` as an **Unpacked extension** at `chrome://extensions` (enable Developer Mode).

### How it works

- The content script injects a Shadow DOM sidebar fixed to the right side of the viewport.
- `MutationObserver` watches for new or edited user messages and re-scrapes prompt items.
- Clicking a prompt scrolls smoothly to the target element and temporarily highlights it.

### Tweaking selectors

- If the sidebar isn’t picking up prompts, adjust `USER_MESSAGE_SELECTOR` in `src/dom/selectors.ts` to match the site’s current structure.

### Quick ideas to extend

- Persist prompt history to `chrome.storage.local` to survive reloads.
- Add grouping by conversation, timestamps, and export to Markdown.
- Add a mini preview (first tokens) on hover.
- Add a setting to dock the panel left/right or auto-hide.
