// src/dom/scrape.ts
import { uid } from '../util/id'
import { SEL, MUTATION_ATTR_FILTER } from './selectors'
import { getActiveThread } from './page'

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
    const counter = article.querySelector<HTMLElement>(SEL.revisionCounter)
    const txt = counter?.textContent?.trim() ?? ''
    const m = txt.match(/(\d+)\s*\/\s*(\d+)/)

    if (m) {
      current = parseInt(m[1], 10)
      total = parseInt(m[2], 10)
    } else {
      // Fallback: if the prev/next controls exist at all, assume there are at least 2 versions.
      const hasPrev = !!article.querySelector(SEL.prevResponseButton)
      const hasNext = !!article.querySelector(SEL.nextResponseButton)
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
 * IMPORTANT: Only scrape inside the active chat thread.
 * If no thread exists (projects list / landing page), treat as empty.
 */
function getThreadRoot(): HTMLElement | null {
  return getActiveThread(document)
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

/**
 * When we don't currently have a thread, we still want to re-run scraping
 * when a thread container appears/disappears.
 */
function mutationAddsOrRemovesThread(m: MutationRecord): boolean {
  if (m.type !== 'childList') return false

  const nodes = [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)]
  return nodes.some((n) => {
    if (!(n instanceof HTMLElement)) return false

    // Direct match
    if (n.matches?.(SEL.threadRoots)) return true

    // Nested match
    if (n.querySelector?.(SEL.threadRoots)) return true

    return false
  })
}

/**
 * Scrape user prompt turns ONLY from the active thread.
 * If no thread exists, returns [].
 */
export function scrapePrompts(root: ParentNode = document): PromptItem[] {
  const scrapeRoot = getScrapeRoot(root)
  if (!scrapeRoot) return []

  const articles = Array.from(
    scrapeRoot.querySelectorAll<HTMLElement>(SEL.userTurn),
  )

  return articles.map((article) => {
    // Prefer stable turn id when provided by ChatGPT
    const turnId = article.getAttribute('data-turn-id') || ''
    const id = turnId || (article.dataset.promptId ||= uid('prompt'))
    if (!article.dataset.promptId) article.dataset.promptId = id

    const textarea = article.querySelector<HTMLTextAreaElement>(SEL.textarea)
    const isEditing = !!textarea

    let scrollTarget: HTMLElement = article
    let text = ''

    if (isEditing) {
      text = textarea!.value
      scrollTarget = article
    } else {
      const bubble = article.querySelector<HTMLElement>(SEL.userMessageBubble)
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

  // If no thread exists, ONLY react to thread being added/removed.
  if (!thread) return mutationAddsOrRemovesThread(m)

  // Ignore mutations outside the thread once it exists.
  if (!nodeIsInThread(m.target)) return false

  if (m.type === 'childList') {
    const nodes = [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)]

    // New/removed user turns (or a subtree containing them)
    if (
      nodes.some(
        (n) =>
          n instanceof HTMLElement &&
          (n.matches(SEL.userTurn) || !!n.querySelector?.(SEL.userTurn)),
      )
    ) {
      return true
    }

    // Editing UI appearing/disappearing inside a user turn
    const targetEl = m.target as HTMLElement
    const userArticle = targetEl.closest(SEL.userTurn) as HTMLElement | null

    if (userArticle) {
      if (
        nodes.some(
          (n) =>
            n instanceof HTMLElement &&
            (n.matches(SEL.editableSurface) ||
              !!n.querySelector?.(SEL.editableSurface)),
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

    const userArticle = el.closest(SEL.userTurn) as HTMLElement | null
    if (!userArticle) return false

    // Any attribute change on the user article itself could affect layout/state.
    if (el === userArticle) return true

    // Revision counter or version nav controls changed.
    if (
      el.matches(SEL.revisionCounter) ||
      !!el.closest(SEL.revisionCounter) ||
      el.matches(SEL.prevResponseButton) ||
      el.matches(SEL.nextResponseButton)
    ) {
      return true
    }

    return false
  }

  return false
}

/**
 * Debounce updates while an editor is focused (typing).
 */
function isEditorFocused(): boolean {
  const thread = getThreadRoot()
  const scope: ParentNode = thread ?? document
  return !!scope.querySelector(SEL.focusedEditor)
}

export function observePrompts(
  onUpdate: (items: PromptItem[]) => void,
  root: ParentNode = document,
) {
  const DEBUG = false

  let lastSignature: string | null = null
  let lastThread: HTMLElement | null = null

  const emit = () => {
    // Force refresh when entering/leaving/changing thread
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

  /**
   * Observing the whole document is noisy on ChatGPT. We prefer observing the active thread.
   * But we still need to notice when the thread appears/disappears or changes.
   *
   * Strategy:
   * - Primary observer targets the active thread when available, else document.body.
   * - Secondary observer watches the document for thread root add/remove and retargets primary.
   */
  let primaryTarget: Node =
    getThreadRoot() ?? document.body ?? document.documentElement

  const primaryObserver = new MutationObserver((mutations) => {
    if (DEBUG) console.debug('[NavGPT] primary mutations', mutations)
    if (isRelevantMutationBatch(mutations)) schedule()
  })

  const observePrimary = (target: Node) => {
    primaryObserver.disconnect()
    primaryTarget = target
    primaryObserver.observe(primaryTarget, {
      childList: true,
      subtree: true,
      attributes: false,
      // attributeFilter: [...MUTATION_ATTR_FILTER],
      // characterData: false,
    })
  }

  observePrimary(primaryTarget)

  const threadWatcher = new MutationObserver((mutations) => {
    // Only care about thread roots being added/removed.
    const threadChanged = mutations.some(mutationAddsOrRemovesThread)
    if (!threadChanged) return

    const nextTarget =
      getThreadRoot() ?? document.body ?? document.documentElement
    if (nextTarget !== primaryTarget) observePrimary(nextTarget)

    schedule()
  })

  threadWatcher.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })

  settle(emit)

  return () => {
    if (typingDebounce) window.clearTimeout(typingDebounce)
    primaryObserver.disconnect()
    threadWatcher.disconnect()
  }
}
