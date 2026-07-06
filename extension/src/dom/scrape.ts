import { uid } from '../util/id'
import { SEL } from './selectors'
import { getActiveThread } from './page'
import { getConversationId } from './getConversationId'

export type PromptItem = {
  id: string
  text: string
  rawText: string
  el: HTMLElement
  edits: number
  totalVersions: number

  conversationId?: string
  turnId?: string

  hasResponse: boolean
  responseEl?: HTMLElement
}

function summarize(text: string, max = 2000): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? oneLine.slice(0, max - 1) + '…' : oneLine
}

function parseRevisionInfo(article: HTMLElement | null) {
  let total = 1

  if (article) {
    const versionsBtn = article.querySelector<HTMLElement>(SEL.versionsButton)
    const txt =
      versionsBtn
        ?.querySelector<HTMLElement>(SEL.revisionCounter)
        ?.textContent?.trim() ?? ''
    const n = parseInt(txt, 10)
    if (Number.isFinite(n) && n > 0) total = n
  }

  return {
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
  if (passedRoot !== document) return passedRoot
  return getThreadRoot()
}

function getUserTurnContentEl(article: HTMLElement): HTMLElement {
  return (
    article.querySelector<HTMLElement>(
      '[data-testid="user-message"] [class*="whitespace-pre-wrap"]',
    ) ??
    article.querySelector<HTMLElement>(
      '[data-message-author-role="user"] [class*="whitespace-pre-wrap"]',
    ) ??
    article.querySelector<HTMLElement>(
      '[data-testid="user-message"] .markdown',
    ) ??
    article.querySelector<HTMLElement>(
      '[data-message-author-role="user"] .markdown',
    ) ??
    article.querySelector<HTMLElement>('[data-testid="user-message"]') ??
    article.querySelector<HTMLElement>('[data-message-author-role="user"]') ??
    article
  )
}

function normalizeUserTurnText(text: string): string {
  return text
    .replace(/^\s*You said:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Scrape user prompt turns ONLY from the active thread.
 * If no thread exists, returns [].
 *
 * Each prompt item is also paired with the next assistant turn, if one exists,
 * so the sidebar can expose a lightweight "response" affordance without
 * scraping or storing the full response text.
 */
export function scrapePrompts(root: ParentNode = document): PromptItem[] {
  const scrapeRoot = getScrapeRoot(root)
  if (!scrapeRoot) return []

  const conversationId = getConversationId() ?? undefined
  const turns = Array.from(scrapeRoot.querySelectorAll<HTMLElement>(SEL.turn))
  const items: PromptItem[] = []

  for (let i = 0; i < turns.length; i++) {
    const article = turns[i]
    const turnKind = article.getAttribute('data-turn')

    if (turnKind !== 'user') continue

    const turnId = article.getAttribute('data-turn-id') ?? undefined

    const textarea = article.querySelector<HTMLTextAreaElement>(SEL.textarea)

    let scrollTarget: HTMLElement = article
    let rawText = ''

    if (textarea) {
      rawText = normalizeUserTurnText(textarea.value)
    } else {
      const contentEl = getUserTurnContentEl(article)
      scrollTarget = contentEl
      rawText = normalizeUserTurnText(
        contentEl.innerText || contentEl.textContent || '',
      )
    }

    const id = turnId || article.dataset.promptId || uid('prompt')
    if (!turnId && !article.dataset.promptId) {
      article.dataset.promptId = id
    }

    const { totalVersions, edits } = parseRevisionInfo(article)

    let nextAssistantTurn: HTMLElement | null = null

    for (let j = i + 1; j < turns.length; j++) {
      const candidate = turns[j]
      const candidateKind = candidate.getAttribute('data-turn')

      if (candidateKind === 'assistant') {
        nextAssistantTurn = candidate
        break
      }

      if (candidateKind === 'user') {
        break
      }
    }

    items.push({
      id,
      text: summarize(rawText, 360),
      rawText,
      el: scrollTarget,
      edits,
      totalVersions,
      conversationId,
      turnId,
      hasResponse: !!nextAssistantTurn,
      responseEl: nextAssistantTurn ?? undefined,
    })
  }

  return items
}

/**
 * Debounce updates while an editor is focused (typing).
 * Uses the currently bound thread root rather than rediscovering it.
 *
 * Hard-pause mutation-driven scrapes while the active element is a prompt editor.
 * This prevents the sidebar item text from updating live as the user types.
 */
function isEditorFocusedIn(scope: ParentNode | null): boolean {
  const active = document.activeElement as HTMLElement | null
  if (!active) return false

  const container = scope ?? document
  if (!container.contains(active)) return false

  const isEditable =
    active.matches('textarea') ||
    active.matches('[contenteditable="true"]') ||
    active.matches(SEL.focusedEditor)

  if (!isEditable) return false

  return !!active.closest(SEL.userTurn)
}

export function observePrompts(
  onUpdate: (items: PromptItem[]) => void,
  root: ParentNode = document,
) {
  const DEBUG_PERF = localStorage.getItem('navgpt_debug_perf') === '1'

  type PerfStats = {
    moCallbacks: number
    mutationRecords: number

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
      const avgScr = stats.scrapes > 0 ? stats.scrapeMsTotal / stats.scrapes : 0
      const avgSig = stats.emits > 0 ? stats.sigMsTotal / stats.emits : 0

      console.log('[NavGPT perf]', {
        moCallbacks: stats.moCallbacks,
        mutationRecords: stats.mutationRecords,

        schedules: stats.schedules,
        emits: stats.emits,
        scrapes: stats.scrapes,
        scrapeAvgMs: fmt(avgScr),
        scrapeMaxMs: fmt(stats.scrapeMsMax),
        sigAvgMs: fmt(avgSig),
        sigMaxMs: fmt(stats.sigMsMax),

        lastItemCount: stats.lastItemCount,
      })

      stats.moCallbacks = 0
      stats.mutationRecords = 0

      stats.schedules = 0
      stats.emits = 0
      stats.scrapes = 0
      stats.scrapeMsTotal = 0
      stats.scrapeMsMax = 0
      stats.sigMsTotal = 0
      stats.sigMsMax = 0
    }, 2000)
  }

  let currentThreadRoot: HTMLElement | null = null
  let currentObservedTarget: Node | null = null
  let lastSignature: string | null = null

  let scheduled = false
  let running = false
  let needsAnotherPass = false
  let hydrationTimer: number | null = null
  let bootstrapTimer: number | null = null

  const HYDRATION_SETTLE_MS = 150
  const BOOTSTRAP_POLL_MS = 250
  const BOOTSTRAP_TIMEOUT_MS = 5000

  const emit = () => {
    if (DEBUG_PERF) stats.emits++

    const scrapeRoot = root !== document ? root : currentThreadRoot

    const s0 = DEBUG_PERF ? performance.now() : 0
    const items = scrapeRoot ? scrapePrompts(scrapeRoot) : []
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
          i.turnId || i.id,
          i.edits,
          i.totalVersions,
          i.hasResponse ? 1 : 0,
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

  const runEmit = () => {
    if (running) {
      needsAnotherPass = true
      return
    }

    running = true
    try {
      emit()
    } finally {
      running = false
      if (needsAnotherPass) {
        needsAnotherPass = false
        schedule()
      }
    }
  }

  const schedule = () => {
    if (DEBUG_PERF) stats.schedules++

    const focusScope: ParentNode | null =
      root !== document ? root : currentThreadRoot

    // While editing, do not rescrape at all. We'll refresh on focus-out.
    if (isEditorFocusedIn(focusScope)) return

    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      runEmit()
    })
  }

  const primaryObserver = new MutationObserver((mutations) => {
    if (DEBUG_PERF) {
      stats.moCallbacks++
      stats.mutationRecords += mutations.length
    }

    // Treat mutations as a dirty signal only.
    schedule()
  })

  const observePrimary = (target: Node) => {
    if (target === currentObservedTarget) return
    primaryObserver.disconnect()
    currentObservedTarget = target
    primaryObserver.observe(target, {
      childList: true,
      subtree: true,
      attributes: false,
    })
  }

  const rebindThreadRoot = () => {
    const nextThread = root !== document ? null : getThreadRoot()

    if (nextThread === currentThreadRoot && currentObservedTarget) return false

    currentThreadRoot = nextThread
    lastSignature = null

    const target =
      (root !== document ? root : currentThreadRoot) ??
      document.body ??
      document.documentElement

    observePrimary(target)
    return true
  }

  const stopBootstrapPolling = () => {
    if (bootstrapTimer) {
      window.clearInterval(bootstrapTimer)
      bootstrapTimer = null
    }
  }

  const startBootstrapPolling = () => {
    if (root !== document) return
    if (bootstrapTimer) return

    const startedAt = Date.now()

    bootstrapTimer = window.setInterval(() => {
      const prevThread = currentThreadRoot
      const changed = rebindThreadRoot()

      if (changed || currentThreadRoot !== prevThread) {
        schedule()
      }

      const timedOut = Date.now() - startedAt >= BOOTSTRAP_TIMEOUT_MS
      if (currentThreadRoot || timedOut) {
        stopBootstrapPolling()
      }
    }, BOOTSTRAP_POLL_MS)
  }

  const onFocusOut = (e: FocusEvent) => {
    const target = e.target as HTMLElement | null
    if (!target) return

    const isEditor =
      target.matches('textarea') ||
      target.matches('[contenteditable="true"]') ||
      target.matches(SEL.focusedEditor)

    if (!isEditor) return
    if (!target.closest(SEL.userTurn)) return

    requestAnimationFrame(() => requestAnimationFrame(() => schedule()))
  }

  const settleAfterStructureChange = () => {
    if (hydrationTimer) window.clearTimeout(hydrationTimer)
    hydrationTimer = window.setTimeout(() => {
      hydrationTimer = null

      const prevThread = currentThreadRoot
      const changed = rebindThreadRoot()

      if (!currentThreadRoot || changed || currentThreadRoot !== prevThread) {
        startBootstrapPolling()
      }

      schedule()
    }, HYDRATION_SETTLE_MS)
  }

  rebindThreadRoot()
  settleAfterStructureChange()
  startBootstrapPolling()
  document.addEventListener('focusout', onFocusOut, true)

  return () => {
    if (hydrationTimer) window.clearTimeout(hydrationTimer)
    stopBootstrapPolling()
    document.removeEventListener('focusout', onFocusOut, true)
    primaryObserver.disconnect()
    if (logTimer) window.clearInterval(logTimer)
  }
}
