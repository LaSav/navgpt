import { uid } from '../util/id'

export type PromptItem = {
  id: string
  text: string
  el: HTMLElement // scroll target: bubble if present else article
  edits: number
  totalVersions: number
  currentVersion: number
  isEditing: boolean
}

/** Single-line summary or generous preview (clamped by CSS in sidebar). */
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
  const articles = Array.from(
    root.querySelectorAll<HTMLElement>('article[data-turn="user"]')
  )

  return articles.map((article) => {
    // Stable ID based on data-turn-id; fallback to a persistent data attribute
    const turnId = article.getAttribute('data-turn-id') || ''
    const id = turnId || (article.dataset.promptId ||= uid('prompt'))
    if (!article.dataset.promptId) article.dataset.promptId = id

    const textarea = article.querySelector<HTMLTextAreaElement>('textarea')
    const isEditing = !!textarea

    let scrollTarget: HTMLElement = article
    let text = ''

    if (isEditing) {
      text = textarea!.value
      scrollTarget = article // bubble is absent during edit
    } else {
      const bubble = article.querySelector<HTMLElement>(
        '[data-message-author-role="user"]'
      )
      text = bubble?.innerText || bubble?.textContent || '' || ''
      if (bubble) scrollTarget = bubble // precise aim when not editing
    }

    const { currentVersion, totalVersions, edits } = parseRevisionInfo(article)
    const short = summarize(text, 2000)

    return {
      id,
      text: short,
      el: scrollTarget,
      edits,
      totalVersions,
      currentVersion,
      isEditing,
    }
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
    attributes: true,
    attributeFilter: ['class', 'data-state', 'data-writing-block'],
  })
  emit()
  return () => mo.disconnect()
}
