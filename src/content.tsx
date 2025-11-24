import { render } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import Sidebar from './ui/Sidebar'
import { observePrompts, scrapePrompts, type PromptItem } from './dom/scrape'
import { attachThemeSync } from './dom/themeSync'
import { CHAT_ROOT_SELECTOR } from './dom/selectors'

// Load CSS into the shadow root
async function loadStyles(shadow: ShadowRoot) {
  try {
    const url = chrome.runtime.getURL('assets/styles.css')
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to load CSS: ${res.status}`)
    const css = await res.text()
    const style = document.createElement('style')
    style.textContent = css
    shadow.appendChild(style)
  } catch (err) {
    console.warn('[prompt-sidebar] Failed to load styles', err)
  }
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

function App({
  shadowMount,
  chatRoot,
  originalPaddingRight,
}: {
  shadowMount: HTMLElement
  chatRoot?: HTMLElement
  originalPaddingRight: string
}) {
  const [items, setItems] = useState<PromptItem[]>(() => scrapePrompts())
  const [activeId, setActiveId] = useState<string | undefined>(undefined)
  const [isOpen, setIsOpen] = useState(true)

  const scrollerRef = useRef<HTMLElement | null>(
    items[0]?.el ? getScrollParent(items[0].el) : null
  )

  const onJump = (id: string) => {
    const target = items.find((i) => i.id === id)?.el
    if (target) {
      snapToPrompt(target)
      setActiveId(id)
      scrollSidebarActiveIntoView(shadowMount, id)
    }
  }

  const goToPromptByOffset = (direction: 1 | -1) => {
    if (!items.length) return

    const currentIndex = activeId
      ? items.findIndex((i) => i.id === activeId)
      : -1

    let nextIndex: number

    if (currentIndex === -1) {
      nextIndex = direction === 1 ? 0 : items.length - 1
    } else {
      nextIndex = currentIndex + direction
    }
    if (nextIndex < 0 || nextIndex >= items.length) return

    const nextItem = items[nextIndex]
    if (nextItem) {
      onJump(nextItem.id)
    }
  }

  const handleNextPrompt = () => goToPromptByOffset(1)
  const handlePreviousPrompt = () => goToPromptByOffset(-1)

  const OPEN_WIDTH = 330
  const MINI_WIDTH = 66

  useEffect(() => {
    if (!chatRoot) return

    chatRoot.style.transition = chatRoot.style.transition
      ? `${chatRoot.style.transition}, padding-right 0.18s ease-out`
      : 'padding-right 0.18s ease-out'

    const base = parseFloat(originalPaddingRight || '0') || 0
    const extra = isOpen ? OPEN_WIDTH : MINI_WIDTH

    chatRoot.style.paddingRight = `${base + extra}px`
  }, [chatRoot, originalPaddingRight, isOpen])

  useEffect(() => {
    const rootNode = chatRoot ?? document
    const stop = observePrompts((next) => {
      setItems(next)
      const nextScroller = next[0]?.el
        ? getScrollParent(next[0].el)
        : scrollerRef.current
      scrollerRef.current = nextScroller
    }, rootNode)

    return () => stop()
  }, [chatRoot])

  useEffect(() => {
    const onResize = () => {
      scrollerRef.current = items[0]?.el
        ? getScrollParent(items[0].el)
        : scrollerRef.current
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [items])

  const handleToggle = () => setIsOpen((prev) => !prev)

  return (
    <Sidebar
      items={items}
      onJump={onJump}
      activeId={activeId}
      isOpen={isOpen}
      onToggle={handleToggle}
      onNextPrompt={handleNextPrompt}
      onPreviousPrompt={handlePreviousPrompt}
    />
  )
}

async function main() {
  const root = mountSidebar()
  if (!root) return

  const detachThemeSync = attachThemeSync(root.host)
  await loadStyles(root.shadow)

  const chatRoot = document.querySelector(CHAT_ROOT_SELECTOR)

  let originalPaddingRight = '0px'
  if (chatRoot instanceof HTMLElement) {
    originalPaddingRight = getComputedStyle(chatRoot).paddingRight
  }

  render(
    <App
      shadowMount={root.mount}
      chatRoot={chatRoot instanceof HTMLElement ? chatRoot : undefined}
      originalPaddingRight={originalPaddingRight}
    />,
    root.mount
  )

  window.addEventListener('unload', () => {
    detachThemeSync()
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main)
} else {
  main()
}
