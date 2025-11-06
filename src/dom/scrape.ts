import { USER_MESSAGE_SELECTOR } from './selectors'
import { uid } from '../util/id'

export type PromptItem = {
  id: string
  text: string
  el: HTMLElement
  edits: number // ← number of edits detected
  totalVersions: number // ← denominator of x/y (y)
  currentVersion: number // ← numerator of x/y (x)
}

/** Create a stable id for an element, store on dataset. */
function ensureId(el: HTMLElement): string {
  const existing = el.dataset.promptId
  if (existing) return existing
  const id = uid('prompt')
  el.dataset.promptId = id
  return id
}

/** Extract a concise single-line label. */
function summarize(text: string, max = 100): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? oneLine.slice(0, max - 1) + '…' : oneLine
}

function parseRevisionInfo(article: HTMLElement | null) {
  // Default: no edits
  let current = 1,
    total = 1

  if (article) {
    // Try to find the x/y counter (classes can shift; be forgiving)
    const counter =
      article.querySelector<HTMLElement>('.tabular-nums') ||
      article.querySelector<HTMLElement>('[class*="tabular-nums"]')

    const txt = counter?.textContent?.trim() ?? ''
    // Expect forms like "2/2", "1 / 3", etc.
    const m = txt.match(/(\d+)\s*\/\s*(\d+)/)
    if (m) {
      current = parseInt(m[1], 10)
      total = parseInt(m[2], 10)
    } else {
      // Fallback: presence of a "Previous response" button implies at least 2 versions
      const hasPrev = !!article.querySelector(
        '[aria-label="Previous response"]'
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
  const nodes = Array.from(
    root.querySelectorAll<HTMLElement>('[data-message-author-role="user"]')
  )

  return nodes.map((el) => {
    // Find the surrounding "turn" <article ... data-turn="user">
    const article = el.closest<HTMLElement>('article[data-turn="user"]')
    const { currentVersion, totalVersions, edits } = parseRevisionInfo(article)

    // Stable id kept on the message element
    const id =
      el.dataset.promptId ||
      (el.dataset.promptId = `prompt-${
        crypto.randomUUID?.() || Math.random().toString(36).slice(2)
      }`)

    // Summarize text to a single line
    const text = (el.innerText || el.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
    const short = text.length > 1000 ? text.slice(0, 1000) + '…' : text

    return { id, text: short, el, edits, totalVersions, currentVersion }
  })
}

/** Observe DOM changes and rescrape when messages appear/disappear. */
export function observePrompts(onUpdate: (items: PromptItem[]) => void) {
  const emit = () => onUpdate(scrapePrompts())
  const mo = new MutationObserver(() => emit())
  mo.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  })
  emit()
  return () => mo.disconnect()
}
