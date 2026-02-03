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

/**
 * --- NEW: thread / scrape root helpers ---
 * IMPORTANT: Only scrape inside the active thread.
 * If no thread exists, treat as empty (clears sidebar).
 */
function getThreadRoot(): HTMLElement | null {
  const candidates: HTMLElement[] = []

  const byId = document.getElementById('thread')
  if (byId) candidates.push(byId)

  candidates.push(
    ...Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="thread"], [data-testid="conversation-thread"]',
      ),
    ),
  )

  // De-dupe
  const uniq = Array.from(new Set(candidates)).filter(Boolean)

  // ✅ Only consider it a "real chat thread" if it has message turns.
  // Projects index has #thread but no article[data-turn], so this returns null.
  const withTurns = uniq.filter((el) => el.querySelector('article[data-turn]'))

  if (withTurns.length === 0) return null

  // If there are multiple, prefer one that has user turns specifically.
  return (
    withTurns.find((el) => el.querySelector('article[data-turn="user"]')) ??
    withTurns[0]
  )
}

function getScrapeRoot(passedRoot: ParentNode): ParentNode | null {
  // If caller passes a custom root, respect it.
  if (passedRoot !== document) return passedRoot

  // Default behavior: scope to the active thread only.
  return getThreadRoot()
}

function nodeIsInThread(node: Node): boolean {
  const thread = getThreadRoot()
  if (!thread) return false

  if (node === thread) return true

  if (node instanceof HTMLElement) return thread.contains(node)

  const parent = node.parentElement
  return !!parent && thread.contains(parent)
}

function mutationAddsOrRemovesThread(m: MutationRecord): boolean {
  if (m.type !== 'childList') return false

  const nodes = [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)]

  return nodes.some((n) => {
    if (!(n instanceof HTMLElement)) return false

    // direct match
    if (n.id === 'thread') return true
    if (
      n.matches?.('[data-testid="thread"], [data-testid="conversation-thread"]')
    )
      return true

    // nested match
    if (n.querySelector?.('#thread')) return true
    if (
      n.querySelector?.(
        '[data-testid="thread"], [data-testid="conversation-thread"]',
      )
    )
      return true

    return false
  })
}

/**
 * Scrape prompt articles ONLY from the active thread.
 * If no thread exists (new chat / landing pages), returns [].
 */
export function scrapePrompts(root: ParentNode = document): PromptItem[] {
  const scrapeRoot = getScrapeRoot(root)
  if (!scrapeRoot) return []

  const articles = Array.from(
    scrapeRoot.querySelectorAll<HTMLElement>('article[data-turn="user"]'),
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

function isRelevantMutationBatch(mutations: MutationRecord[]): boolean {
  return mutations.some(isRelevantMutation)
}

function isRelevantMutation(m: MutationRecord): boolean {
  const thread = getThreadRoot()

  // ✅ If no thread exists, ONLY react to thread being added/removed.
  if (!thread) {
    return mutationAddsOrRemovesThread(m)
  }

  // ✅ Ignore mutations outside the thread once it exists.
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
 * --- editing detection ---
 * Debounce sidebar updates while an editor is focused (typing).
 */
function isEditorFocused(): boolean {
  const thread = getThreadRoot()
  const scope: ParentNode = thread ?? document

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
  let lastThread: HTMLElement | null = null

  const emit = () => {
    // ✅ Force refresh when entering/leaving/changing thread
    const threadNow = getThreadRoot()
    if (threadNow !== lastThread) {
      lastThread = threadNow
      lastSignature = null
    }

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

  let typingDebounce: number | null = null
  const TYPING_DEBOUNCE_MS = 250

  const schedule = () => {
    if (isEditorFocused()) {
      if (typingDebounce) window.clearTimeout(typingDebounce)
      typingDebounce = window.setTimeout(() => {
        typingDebounce = null
        settle(emit)
      }, TYPING_DEBOUNCE_MS)
      return
    }

    if (scheduled) return
    scheduled = true
    settle(() => {
      scheduled = false
      emit()
    })
  }

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
