/**
 * Heuristics to detect USER prompts in ChatGPT UI.
 * Tweak as needed. We target elements that represent a single user message.
 */
export const USER_MESSAGE_SELECTOR = [
  // ChatGPT (Sept 2025-era): user messages often have data attributes like below.
  '[data-message-author-role="user"]',
  '[data-testid="user-message"]',
  // Fallbacks / other chat UIs
  '.user, .message.user, [role="article"][data-role="user"]',
].join(',')

/** Where to anchor the sidebar. */
export const CHAT_ROOT_SELECTOR = 'main, #__next, body'
