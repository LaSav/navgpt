import { uid } from '../util/id'

export type PromptItem = {
  id: string
  text: string
  rawText: string
  el: HTMLElement
  edits: number
  totalVersions: number
  currentVersion: number
  isEditing: boolean
}

function summarize(text: string, max = 2000): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? oneLine.slice(0, max - 1) + '…' : oneLine
}

function parseRevisionInfo(article: HTMLElement | null) {
  let current = 1,
    total = 1
  if (article) {
    const counter =
      article.querySelector<HTMLElement>('.tabular-nums') ||
      article.querySelector<HTMLElement>('[class*="tabular-nums"]')
    const txt = counter?.textContent?.trim() ?? ''
    const m = txt.match(/(\d+)\s*\/\s*(\d+)/)
    if (m) {
      current = parseInt(m[1], 10)
      total = parseInt(m[2], 10)
    } else {
      const hasPrev = !!article.querySelector(
        '[aria-label="Previous response"]',
      )
      const hasNext = !!article.querySelector('[aria-label="Next response"]')
      if (hasPrev || hasNext) total = 2
    }
  }
  return {
    currentVersion: current,
    totalVersions: total,
    edits: Math.max(0, total - 1),
  }
}

export function scrapePrompts(root: ParentNode = document): PromptItem[] {
  const articles = Array.from(
    root.querySelectorAll<HTMLElement>('article[data-turn="user"]'),
  )

  return articles.map((article) => {
    const turnId = article.getAttribute('data-turn-id') || ''
    const id = turnId || (article.dataset.promptId ||= uid('prompt'))
    if (!article.dataset.promptId) article.dataset.promptId = id

    const textarea = article.querySelector<HTMLTextAreaElement>('textarea')
    const isEditing = !!textarea

    let scrollTarget: HTMLElement = article
    let text = ''

    if (isEditing) {
      text = textarea!.value
      scrollTarget = article
    } else {
      const bubble = article.querySelector<HTMLElement>(
        '[data-message-author-role="user"]',
      )
      text = bubble?.textContent || ''
      if (bubble) scrollTarget = bubble
    }

    const { currentVersion, totalVersions, edits } = parseRevisionInfo(article)
    const short = summarize(text, 360)

    return {
      id,
      text: short,
      rawText: text,
      el: scrollTarget,
      edits,
      totalVersions,
      currentVersion,
      isEditing,
    }
  })
}

/**
 * --- NEW: scope helpers ---
 * We observe document.body but ignore anything outside #thread.
 */
function getThreadRoot(): HTMLElement | null {
  // If your app sometimes uses a different container, you can OR selectors here.
  return (
    document.getElementById('thread') ||
    document.querySelector<HTMLElement>('[data-testid="thread"]') ||
    document.querySelector<HTMLElement>(
      '[data-testid="conversation-thread"]',
    ) ||
    document.querySelector<HTMLElement>('main') // last-resort
  )
}

function nodeIsInThread(node: Node): boolean {
  const thread = getThreadRoot()
  if (!thread) return true // if thread not found, don't accidentally ignore everything

  if (node === thread) return true

  // element targets
  if (node instanceof HTMLElement) return thread.contains(node)

  // text/comment nodes: check parent
  const parent = node.parentElement
  return !!parent && thread.contains(parent)
}

function isRelevantMutationBatch(mutations: MutationRecord[]): boolean {
  return mutations.some(isRelevantMutation)
}

function isRelevantMutation(m: MutationRecord): boolean {
  // --- NEW: ignore mutations outside #thread ---
  if (!nodeIsInThread(m.target)) return false

  if (m.type === 'childList') {
    const nodes = [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)]

    if (
      nodes.some(
        (n) =>
          n instanceof HTMLElement &&
          (n.matches('article[data-turn="user"]') ||
            !!n.querySelector?.('article[data-turn="user"]')),
      )
    ) {
      return true
    }

    const targetEl = m.target as HTMLElement
    const userArticle = targetEl.closest(
      'article[data-turn="user"]',
    ) as HTMLElement | null

    if (userArticle) {
      if (
        nodes.some(
          (n) =>
            n instanceof HTMLElement &&
            (n.matches('textarea, [contenteditable="true"], form') ||
              !!n.querySelector?.('textarea, [contenteditable="true"]')),
        )
      ) {
        return true
      }
    }

    return false
  }

  if (m.type === 'attributes') {
    const el = m.target as HTMLElement
    if (!el) return false

    const userArticle = el.closest(
      'article[data-turn="user"]',
    ) as HTMLElement | null
    if (!userArticle) return false

    if (el === userArticle) return true

    if (
      el.classList.contains('tabular-nums') ||
      el.getAttribute('aria-label') === 'Previous response' ||
      el.getAttribute('aria-label') === 'Next response'
    ) {
      return true
    }

    return false
  }

  return false
}

/**
 * --- NEW: editing detection ---
 * Debounce sidebar updates while an editor is focused (typing).
 */
function isEditorFocused(): boolean {
  const thread = getThreadRoot()

  // If thread isn't mounted yet, fall back to document-level focus check.
  const scope: ParentNode = thread ?? document

  // textarea focus OR contenteditable focus
  const focused = scope.querySelector(
    'textarea:focus, [contenteditable="true"]:focus',
  )
  return !!focused
}

export function observePrompts(
  onUpdate: (items: PromptItem[]) => void,
  root: ParentNode = document,
) {
  let lastSignature: string | null = null

  const emit = () => {
    const items = scrapePrompts(root)

    const signature = items
      .map((i) => {
        const t = i.rawText || i.text || ''
        return [
          i.id,
          i.edits,
          i.currentVersion,
          i.totalVersions,
          i.isEditing ? 1 : 0,
          t.length,
          t.slice(0, 80),
        ].join('|')
      })
      .join('||')

    if (signature === lastSignature) return
    lastSignature = signature

    onUpdate(items)
  }

  const settle = (fn: () => void) => requestAnimationFrame(fn)

  let scheduled = false

  // --- NEW: debounce timer used while editing ---
  let typingDebounce: number | null = null
  const TYPING_DEBOUNCE_MS = 250

  const schedule = () => {
    // If we’re actively typing, debounce emits.
    if (isEditorFocused()) {
      if (typingDebounce) window.clearTimeout(typingDebounce)
      typingDebounce = window.setTimeout(() => {
        typingDebounce = null
        // do not block by "scheduled" flag here; typing replaces it anyway
        settle(emit)
      }, TYPING_DEBOUNCE_MS)
      return
    }

    // Normal (non-typing) path: coalesce via rAF like before.
    if (scheduled) return
    scheduled = true
    settle(() => {
      scheduled = false
      emit()
    })
  }

  // --- CHANGED: always observe document.body (stable across navigation) ---
  const observerTarget = document.body || document.documentElement

  const mo = new MutationObserver((mutations) => {
    const relevant = isRelevantMutationBatch(mutations)
    if (relevant) schedule()
  })

  mo.observe(observerTarget, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      'class',
      'disabled',
      'aria-disabled',
      'aria-label',
      'data-state',
      'data-writing-block',
    ],
    characterData: false,
  })

  settle(emit)

  return () => {
    if (typingDebounce) window.clearTimeout(typingDebounce)
    mo.disconnect()
  }
}
