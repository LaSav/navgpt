import { render } from 'preact'
import Sidebar from './ui/Sidebar'
import { observePrompts, scrapePrompts, type PromptItem } from './dom/scrape'
import { attachThemeSync } from './dom/themeSync'
import { CHAT_ROOT_SELECTOR } from './dom/selectors'
import { setGlobalStyles } from './ui/globalStyles'

// Load CSS into the shadow root
async function loadStyles(shadow: ShadowRoot) {
  const url = chrome.runtime.getURL('assets/styles.css')
  const css = await fetch(url).then((r) => r.text())
  const style = document.createElement('style')
  style.textContent = css
  shadow.appendChild(style)
}

// Shadow root mount
function mountSidebar() {
  if (document.getElementById('prompt-sidebar-root')) return null
  const host = document.createElement('div')
  host.id = 'prompt-sidebar-root'
  host.style.all = 'initial'
  document.documentElement.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })
  const mount = document.createElement('div')
  shadow.appendChild(mount)
  return { host, shadow, mount } // <-- include host
}

// Find real scroller
function getScrollParent(node: HTMLElement): HTMLElement {
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

function getStickyOffsetWithin(scroller: HTMLElement): number {
  const cs = getComputedStyle(scroller)
  const varVal = cs.getPropertyValue('--header-height').trim()
  const fromVar = varVal ? parseFloat(varVal) : 0
  if (fromVar) return fromVar
  const header = scroller.querySelector<HTMLElement>(
    'header, nav, [data-testid="top-bar"]'
  )
  return header ? header.getBoundingClientRect().height : 0
}

// Snap-to-target (no animation, with tiny correction)
function snapToPrompt(el: HTMLElement) {
  const scroller = getScrollParent(el)
  const offset = getStickyOffsetWithin(scroller) + 16
  const e = el.getBoundingClientRect()
  const s = scroller.getBoundingClientRect()
  const target = scroller.scrollTop + (e.top - s.top) - offset
  scroller.scrollTop = target
  requestAnimationFrame(() => {
    const e2 = el.getBoundingClientRect()
    const s2 = scroller.getBoundingClientRect()
    const residual = e2.top - s2.top - offset
    if (Math.abs(residual) > 1) scroller.scrollTop += residual
  })
}

function highlightAndScrollTo(el: HTMLElement) {
  snapToPrompt(el)
  el.classList.add('__prompt-highlight')
  setTimeout(() => el.classList.remove('__prompt-highlight'), 1700)
}

// Keep active sidebar item visible
function scrollSidebarActiveIntoView(
  shadowMount: HTMLElement,
  activeId?: string
) {
  if (!activeId) return
  const list = shadowMount.querySelector('.list') as HTMLElement | null
  const btn = shadowMount.querySelector<HTMLElement>(
    `.item[data-prompt-id="${CSS.escape(activeId)}"]`
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

/** IntersectionObserver-based active tracker */
function makeActiveTracker(
  getItems: () => PromptItem[],
  getScroller: () => HTMLElement | null,
  onActive: (id?: string) => void
) {
  let io: IntersectionObserver | null = null

  function refreshObserver() {
    io?.disconnect()
    const scroller = getScroller()
    if (!scroller) return

    const offset = getStickyOffsetWithin(scroller) + 16

    io = new IntersectionObserver(
      (entries) => {
        const items = getItems()
        const sRect = scroller.getBoundingClientRect()
        const anchorY = sRect.top + offset

        // Filter to intersecting targets and compute top distances
        let bestId: string | undefined
        let bestScore = Number.POSITIVE_INFINITY

        for (const e of entries) {
          if (!e.isIntersecting) continue
          const el = e.target as HTMLElement
          const item = items.find((it) => it.el === el)
          if (!item) continue
          const rTop = el.getBoundingClientRect().top
          const dy = rTop - anchorY
          const score = Math.abs(dy) + (dy < 0 ? 8 : 0) // light bias to items below anchor
          if (score < bestScore) {
            bestScore = score
            bestId = item.id
          }
        }

        if (bestId) onActive(bestId)
      },
      {
        root: scroller,
        rootMargin: '0px',
        threshold: [0, 0.01, 0.1, 0.5, 1],
      }
    )

    // (Re)observe current items
    for (const it of getItems()) {
      if (it.el?.isConnected) io.observe(it.el)
    }
  }

  function onItemsChanged() {
    refreshObserver()
  }

  function disconnect() {
    io?.disconnect()
  }

  return { refreshObserver, onItemsChanged, disconnect }
}

async function main() {
  const root = mountSidebar()
  if (!root) return

  // Theme sync
  const detachThemeSync = attachThemeSync(root.host)

  await loadStyles(root.shadow)

  // Global highlight CSS for page elements
  setGlobalStyles(
    'highlight',
    `
    @keyframes promptPulse {
      0%   { background: rgba(138,180,248,.22); }
      100% { background: transparent; }
    }
    .__prompt-highlight {
      animation: promptPulse 1600ms ease-out 1;
      outline: 3px solid #8ab4f8;
      outline-offset: 2px;
      border-radius: 8px;
    }
  `
  )

  let items: PromptItem[] = scrapePrompts()
  let scroller: HTMLElement | null = items[0]?.el
    ? getScrollParent(items[0].el)
    : null
  let activeId: string | undefined

  const onJump = (id: string) => {
    const target = items.find((i) => i.id === id)?.el
    if (target) {
      highlightAndScrollTo(target)
      activeId = id
      render(
        <Sidebar items={items} onJump={onJump} activeId={activeId} />,
        root.mount
      )
      scrollSidebarActiveIntoView(root.mount, activeId)
    }
  }

  // IO-based active tracker
  const tracker = makeActiveTracker(
    () => items,
    () => scroller,
    (id) => {
      if (id && id !== activeId) {
        activeId = id
        render(
          <Sidebar items={items} onJump={onJump} activeId={activeId} />,
          root.mount
        )
        scrollSidebarActiveIntoView(root.mount, activeId)
      }
    }
  )
  tracker.refreshObserver()

  // Initial render
  render(
    <Sidebar items={items} onJump={onJump} activeId={activeId} />,
    root.mount
  )

  // React to DOM changes
  const stop = observePrompts((next) => {
    items = next
    scroller = items[0]?.el ? getScrollParent(items[0].el) : scroller
    render(
      <Sidebar items={items} onJump={onJump} activeId={activeId} />,
      root.mount
    )
    tracker.onItemsChanged()

    // After paint, re-evaluate once (helps after big layout changes)
    requestAnimationFrame(() => tracker.onItemsChanged())
  })

  // Make space for panel
  const chatRoot = document.querySelector(CHAT_ROOT_SELECTOR)
  if (chatRoot instanceof HTMLElement) chatRoot.style.paddingRight = '330px'

  // Cleanup
  window.addEventListener('unload', () => {
    tracker.disconnect()
    stop()
    detachThemeSync()
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main)
} else {
  main()
}
