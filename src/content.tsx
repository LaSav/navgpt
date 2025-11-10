import { render } from 'preact'
import { useEffect, useRef, useState, useMemo } from 'preact/hooks'
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
  return { host, shadow, mount }
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

// Keep active sidebar item visible (when you click to jump)
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

/** Mount-once app so Sidebar state (like search) is stable */
function App({ shadowMount }: { shadowMount: HTMLElement }) {
  const [items, setItems] = useState<PromptItem[]>(() => scrapePrompts())
  const [activeId, setActiveId] = useState<string | undefined>(undefined)
  const scrollerRef = useRef<HTMLElement | null>(
    items[0]?.el ? getScrollParent(items[0].el) : null
  )

  const onJump = (id: string) => {
    const target = items.find((i) => i.id === id)?.el
    if (target) {
      highlightAndScrollTo(target)
      setActiveId(id)
      scrollSidebarActiveIntoView(shadowMount, id)
    }
  }

  useEffect(() => {
    const stop = observePrompts((next) => {
      setItems(next) // ← updates items; query is preserved
      const nextScroller = next[0]?.el
        ? getScrollParent(next[0].el)
        : scrollerRef.current
      scrollerRef.current = nextScroller
    })
    return () => stop()
  }, [])

  useEffect(() => {
    const onResize = () => {
      scrollerRef.current = items[0]?.el
        ? getScrollParent(items[0].el)
        : scrollerRef.current
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [items])

  return <Sidebar items={items} onJump={onJump} activeId={activeId} />
}

async function main() {
  const root = mountSidebar()
  if (!root) return

  const detachThemeSync = attachThemeSync(root.host)
  await loadStyles(root.shadow)

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

  const chatRoot = document.querySelector(CHAT_ROOT_SELECTOR)
  if (chatRoot instanceof HTMLElement) chatRoot.style.paddingRight = '330px'

  // Mount exactly once; no repeated render() calls from elsewhere.
  render(<App shadowMount={root.mount} />, root.mount)

  window.addEventListener('unload', () => {
    detachThemeSync()
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main)
} else {
  main()
}
