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

export function snapToPrompt(targetEl: HTMLElement) {
  const article =
    (targetEl.closest(SEL.userTurn) as HTMLElement | null) ?? targetEl
  if (!article.isConnected) return

  const scroller = getScrollParent(article)

  article.scrollIntoView({
    block: 'start',
    inline: 'nearest',
    behavior: 'auto' as ScrollBehavior,
  })

  let frames = 0
  let lastTop: number | null = null
  let stable = 0

  const maxFrames = 12
  const stableEps = 0.5
  const minCorrectPx = 14

  const refine = () => {
    if (!article.isConnected) return

    const top = article.getBoundingClientRect().top
    const overlay = getTopOverlayOffset()

    if (lastTop !== null && Math.abs(top - lastTop) < stableEps) stable++
    else stable = 0
    lastTop = top

    if (stable >= 2 || frames >= maxFrames) {
      const rect = article.getBoundingClientRect()
      const viewportTop =
        scroller === document.scrollingElement
          ? 0
          : scroller.getBoundingClientRect().top

      const delta = rect.top - viewportTop - overlay

      if (Math.abs(delta) > minCorrectPx) {
        scroller.scrollBy({ top: delta, behavior: 'smooth' })
      }
      return
    }

    frames++
    requestAnimationFrame(refine)
  }

  requestAnimationFrame(() => requestAnimationFrame(refine))
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
