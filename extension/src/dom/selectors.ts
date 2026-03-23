export const SEL = {
  /** Layout anchors (used for layout root + sticky header offset) */
  header: '#page-header, [data-testid="top-bar"], header',
  main: '#main, main',

  /** Thread roots (active conversation container candidates) */
  threadRoots:
    '#thread, [data-testid="thread"], [data-testid="conversation-thread"]',

  /** Chat turns */
  turn: 'article[data-turn], section[data-turn]',
  userTurn: 'article[data-turn="user"], section[data-turn="user"]',
  assistantTurn:
    'article[data-turn="assistant"], section[data-turn="assistant"]',

  /**
   * User message content node inside a user turn.
   * Keep this narrow. Broad class-based fallbacks like ".user" are too noisy.
   */
  userMessageBubble:
    '[data-testid="user-message"], [data-message-author-role="user"]',

  /** Assistant message content node */
  assistantMessageBubble:
    '[data-testid="assistant-message"], [data-message-author-role="assistant"]',

  /** Response headings */
  responseHeading: 'h2',

  /** Projects index/list view markers inside #thread */
  projectsIndexMarkers: [
    '[data-testid="project-conversation-overflow-menu"]',
    '[data-testid="project-conversation-overflow-date"]',
  ].join(','),

  /** Editing detection */
  textarea: 'textarea',
  editableSurface: 'textarea, [contenteditable="true"]',
  focusedEditor: 'textarea:focus, [contenteditable="true"]:focus',

  /** Edit button(s) in a user turn */
  editMessageButtonExact: 'button[aria-label="Edit message"]',
  editMessageButtonPrefix: 'button[aria-label^="Edit"]',

  /** Response version navigation in a turn */
  prevResponseButton: 'button[aria-label="Previous response"]',
  nextResponseButton: 'button[aria-label="Next response"]',

  /** Revision counter inside a turn (e.g., "1 / 2") */
  revisionCounter: '.tabular-nums, [class*="tabular-nums"]',

  /** Misc UI heuristics used in main() to pick a chat root container */
  mainContainerFallback: '[class*="container/main"]',

  /** Sidebar host elements (injected by the extension) */
  sidebarHostId: '#prompt-sidebar-root',
  sidebarMountId: '#prompt-sidebar-mount',

  /** Sidebar internal selectors (inside shadow DOM) */
  sidebarList: '.list',
  sidebarItem: '.item[data-prompt-id]',
} as const
