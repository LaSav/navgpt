import { USER_MESSAGE_SELECTOR } from './selectors'
import { uid } from '../util/id'

export type PromptItem = {
  id: string
  text: string
  el: HTMLElement
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

export function scrapePrompts(root: ParentNode = document): PromptItem[] {
  const nodes = Array.from(
    root.querySelectorAll<HTMLElement>(USER_MESSAGE_SELECTOR)
  )
  return nodes.map((el) => {
    const text = summarize(el.innerText || el.textContent || '')
    return { id: ensureId(el), text, el }
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
