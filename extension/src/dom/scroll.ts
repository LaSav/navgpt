import { SEL } from './selectors'
import { getTopOverlayOffset } from './layout'

export function getScrollParent(node: HTMLElement): HTMLElement {
  for (
    let p = node.parentElement as HTMLElement | null;
    p;
    p = p.parentElement
  ) {
    const s = getComputedStyle(p)
    if (/(auto|scroll)/.test(s.overflow + s.overflowY + s.overflowX)) return p
  }
  return (document.scrollingElement as HTMLElement) || document.documentElement
}

/**
 * Generic "snap to element" helper that accounts for sticky top overlays.
 * Use this for headings, prompt bubbles, or any other in-thread anchor.
 */
export function snapToElement(
  targetEl: HTMLElement,
  { scroller }: { scroller?: HTMLElement | null } = {},
) {
  if (!targetEl.isConnected) return

  const scrollEl =
    scroller ??
    (document.scrollingElement as HTMLElement) ??
    document.documentElement

  const headerOffset = getTopOverlayOffset()
  const GAP = 8
  const containerRect = scrollEl.getBoundingClientRect()
  const targetRect = targetEl.getBoundingClientRect()
  scrollEl.scrollTop += targetRect.top - containerRect.top - headerOffset - GAP
}

export function snapToPrompt(
  targetEl: HTMLElement,
  scroller?: HTMLElement | null,
) {
  const article =
    (targetEl.closest(SEL.userTurn) as HTMLElement | null) ?? targetEl
  if (!article.isConnected) return

  snapToElement(article, { scroller })
}

export function scrollSidebarActiveIntoView(
  shadowMount: HTMLElement,
  activeId?: string,
) {
  if (!activeId) return

  const list = shadowMount.querySelector(SEL.sidebarList) as HTMLElement | null
  const itemBase = SEL.sidebarItem.split('[')[0] || '.item'

  const btn = shadowMount.querySelector<HTMLElement>(
    `${itemBase}[data-prompt-id="${CSS.escape(activeId)}"]`,
  )

  if (!list || !btn) return

  const b = btn.getBoundingClientRect()
  const l = list.getBoundingClientRect()
  const isAbove = b.top < l.top + 8
  const isBelow = b.bottom > l.bottom - 8

  if (isAbove || isBelow) {
    btn.scrollIntoView({
      block: isAbove ? 'start' : 'end',
      inline: 'nearest',
      behavior: 'auto',
    })
  }
}
