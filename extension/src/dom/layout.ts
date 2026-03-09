import { SEL } from './selectors'

function looksLikeAppLayout(el: HTMLElement): boolean {
  const cs = getComputedStyle(el)
  if (cs.display !== 'flex') return false
  if (cs.flexDirection !== 'column') return false

  const vw = document.documentElement.clientWidth
  if (Math.abs(el.getBoundingClientRect().width - vw) > 6) return false

  return true
}

function containsThreadOrMain(el: HTMLElement): boolean {
  const main = document.querySelector<HTMLElement>(SEL.main)
  const thread = document.querySelector<HTMLElement>(SEL.threadRoots)
  return (!!main && el.contains(main)) || (!!thread && el.contains(thread))
}

function pickPaddingTargetFrom(root: HTMLElement): HTMLElement {
  const children = Array.from(root.children).filter(
    (c): c is HTMLElement => c instanceof HTMLElement,
  )

  const best =
    children.find((c) => containsThreadOrMain(c) && looksLikeAppLayout(c)) ??
    children.find((c) => containsThreadOrMain(c)) ??
    null

  return best ?? root
}

/**
 * Find a stable container that includes both the header and main content.
 * We pad this element on the right so the page shifts instead of the sidebar overlapping content.
 */
export function findLayoutRoot(): HTMLElement {
  const header = document.querySelector<HTMLElement>(SEL.header)
  const main = document.querySelector<HTMLElement>(SEL.main)

  if (!header || !main) return document.body

  const chain = (el: HTMLElement) => {
    const result: HTMLElement[] = []
    for (
      let node: HTMLElement | null = el;
      node && node !== document.body && node !== document.documentElement;
      node = node.parentElement
    ) {
      result.push(node)
    }
    return result
  }

  const headerChain = chain(header)
  const mainChain = chain(main)
  const mainSet = new Set(mainChain)

  for (let i = headerChain.length - 1; i >= 0; i--) {
    const candidate = headerChain[i]
    if (mainSet.has(candidate)) return pickPaddingTargetFrom(candidate)
  }

  return document.body
}

export function getTopOverlayOffset(): number {
  const header = document.querySelector<HTMLElement>(SEL.header)
  if (!header) return 0

  const pos = getComputedStyle(header).position
  if (pos !== 'sticky' && pos !== 'fixed') return 0

  return header.getBoundingClientRect().height
}
