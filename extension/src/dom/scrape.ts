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
  const DEBUG_PERF = localStorage.getItem('navgpt_debug_perf') === '1'

  type PerfStats = {
    // mutation side
    moCallbacks: number
    mutationRecords: number
    relevantBatches: number
    relevanceMsTotal: number
    relevanceMsMax: number

    // emit side
    schedules: number
    emits: number
    scrapes: number
    scrapeMsTotal: number
    scrapeMsMax: number
    sigMsTotal: number
    sigMsMax: number
    lastItemCount: number
  }

  const stats: PerfStats = {
    moCallbacks: 0,
    mutationRecords: 0,
    relevantBatches: 0,
    relevanceMsTotal: 0,
    relevanceMsMax: 0,

    schedules: 0,
    emits: 0,
    scrapes: 0,
    scrapeMsTotal: 0,
    scrapeMsMax: 0,
    sigMsTotal: 0,
    sigMsMax: 0,
    lastItemCount: 0,
  }

  const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '0.0')

  let logTimer: number | null = null
  if (DEBUG_PERF) {
    logTimer = window.setInterval(() => {
      const avgRel =
        stats.relevantBatches > 0
          ? stats.relevanceMsTotal / stats.relevantBatches
          : 0
      const avgScr = stats.scrapes > 0 ? stats.scrapeMsTotal / stats.scrapes : 0
      const avgSig = stats.emits > 0 ? stats.sigMsTotal / stats.emits : 0

      console.log('[NavGPT perf]', {
        moCallbacks: stats.moCallbacks,
        mutationRecords: stats.mutationRecords,
        relevantBatches: stats.relevantBatches,
        relevanceAvgMs: fmt(avgRel),
        relevanceMaxMs: fmt(stats.relevanceMsMax),

        schedules: stats.schedules,
        emits: stats.emits,
        scrapes: stats.scrapes,
        scrapeAvgMs: fmt(avgScr),
        scrapeMaxMs: fmt(stats.scrapeMsMax),
        sigAvgMs: fmt(avgSig),
        sigMaxMs: fmt(stats.sigMsMax),

        lastItemCount: stats.lastItemCount,
      })

      // reset window stats so each log is “per 2 seconds”
      stats.moCallbacks = 0
      stats.mutationRecords = 0
      stats.relevantBatches = 0
      stats.relevanceMsTotal = 0
      stats.relevanceMsMax = 0

      stats.schedules = 0
      stats.emits = 0
      stats.scrapes = 0
      stats.scrapeMsTotal = 0
      stats.scrapeMsMax = 0
      stats.sigMsTotal = 0
      stats.sigMsMax = 0
    }, 2000)
  }

  let lastSignature: string | null = null
  let lastThread: HTMLElement | null = null

  const emit = () => {
    if (DEBUG_PERF) stats.emits++

    // Force refresh when entering/leaving/changing thread
    const threadNow = getThreadRoot()
    if (threadNow !== lastThread) {
      lastThread = threadNow
      lastSignature = null
    }

    const s0 = DEBUG_PERF ? performance.now() : 0
    const items = scrapePrompts(root)
    if (DEBUG_PERF) {
      const dt = performance.now() - s0
      stats.scrapes++
      stats.scrapeMsTotal += dt
      stats.scrapeMsMax = Math.max(stats.scrapeMsMax, dt)
      stats.lastItemCount = items.length
    }

    const g0 = DEBUG_PERF ? performance.now() : 0
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

    if (DEBUG_PERF) {
      const dt = performance.now() - g0
      stats.sigMsTotal += dt
      stats.sigMsMax = Math.max(stats.sigMsMax, dt)
    }

    if (signature === lastSignature) return
    lastSignature = signature

    onUpdate(items)
  }

  const settle = (fn: () => void) => requestAnimationFrame(fn)

  let scheduled = false
  let typingDebounce: number | null = null
  const TYPING_DEBOUNCE_MS = 250

  const schedule = () => {
    if (DEBUG_PERF) stats.schedules++
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
    if (DEBUG_PERF) {
      stats.moCallbacks++
      stats.mutationRecords += mutations.length
    }

    const t0 = DEBUG_PERF ? performance.now() : 0
    const relevant = isRelevantMutationBatch(mutations)
    if (DEBUG_PERF) {
      const dt = performance.now() - t0
      if (relevant) {
        stats.relevantBatches++
        stats.relevanceMsTotal += dt
        stats.relevanceMsMax = Math.max(stats.relevanceMsMax, dt)
      }
    }

    if (relevant) schedule()
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
    if (logTimer) window.clearInterval(logTimer)
  }
}
