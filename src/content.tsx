import { render } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import Sidebar from './ui/Sidebar'
import { observePrompts, scrapePrompts, type PromptItem } from './dom/scrape'
import { attachThemeSync } from './dom/themeSync'

function findLayoutRoot(): HTMLElement {
  const header =
    document.querySelector<HTMLElement>('#page-header') ||
    document.querySelector<HTMLElement>('[data-testid="top-bar"]') ||
    document.querySelector<HTMLElement>('header')

  const main =
    document.querySelector<HTMLElement>('#main') ||
    document.querySelector<HTMLElement>('main')

  if (!header || !main) {
    return document.body
  }

  // Collect ancestor chains up to but NOT including <body>/<html>
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
    if (mainSet.has(candidate)) {
      return candidate
    }
  }

  return document.body
}

function getTopOverlayOffset(): number {
  const header =
    document.querySelector<HTMLElement>('#page-header') ||
    document.querySelector<HTMLElement>('[data-testid="top-bar"]') ||
    document.querySelector<HTMLElement>('header')

  if (!header) return 0

  const pos = getComputedStyle(header).position
  if (pos !== 'sticky' && pos !== 'fixed') return 0

  return header.getBoundingClientRect().height
}

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

  document.body.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })
  const mount = document.createElement('div')
  mount.id = 'prompt-sidebar-mount'
  shadow.appendChild(mount)

  return { host, shadow, mount }
}

async function getEntitlement(forceValidate = false) {
  const r = await chrome.runtime.sendMessage({
    type: 'NAVGPT_VALIDATE',
    force: forceValidate,
  })
  return r.state
}

async function requirePro(): Promise<boolean> {
  const state = await getEntitlement(false)
  if (state?.proAllowed) return true

  // Optional: force validation on gate
  const state2 = await getEntitlement(true)
  if (state2?.proAllowed) return true

  // Trust-first UX: just inform; don’t hard-block your whole extension unless you want to.
  alert('This feature requires NavGPT Pro. Upgrade or enter a license key.')
  return false
}

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

function snapToPrompt(targetEl: HTMLElement) {
  const article =
    (targetEl.closest('article[data-turn="user"]') as HTMLElement | null) ??
    targetEl
  if (!article.isConnected) return

  const scroller = getScrollParent(article)

  // 1) Coarse jump: let the browser do the heavy lifting (virtualization/layout will catch up)
  article.scrollIntoView({
    block: 'start',
    inline: 'nearest',
    behavior: 'instant' as ScrollBehavior,
  })

  // 2) After layout settles, apply a *small* smooth correction (no second snap)
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
        scroller.scrollBy({
          top: delta,
          behavior: 'smooth',
        })
      }
      return
    }

    frames++
    requestAnimationFrame(refine)
  }

  requestAnimationFrame(() => requestAnimationFrame(refine))
}

// Keep active sidebar item visible (when you click to jump)
function scrollSidebarActiveIntoView(
  shadowMount: HTMLElement,
  activeId?: string,
) {
  if (!activeId) return
  const list = shadowMount.querySelector('.list') as HTMLElement | null
  const btn = shadowMount.querySelector<HTMLElement>(
    `.item[data-prompt-id="${CSS.escape(activeId)}"]`,
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
  layoutRoot,
  originalLayoutPaddingRight,
}: {
  shadowMount: HTMLElement
  chatRoot?: HTMLElement
  layoutRoot?: HTMLElement
  originalLayoutPaddingRight: string
}) {
  const [items, setItems] = useState<PromptItem[]>(() => scrapePrompts())
  const [activeId, setActiveId] = useState<string | undefined>(undefined)
  const [isOpen, setIsOpen] = useState(true)

  const scrollerRef = useRef<HTMLElement | null>(
    items[0]?.el ? getScrollParent(items[0].el) : null,
  )

  const onJump = (id: string) => {
    const target = items.find((i) => i.id === id)?.el
    if (target) {
      snapToPrompt(target)
      setActiveId(id)
      scrollSidebarActiveIntoView(shadowMount, id)
    }
  }

  const onEdit = (id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item) return

    const article =
      (item.el.closest('article[data-turn="user"]') as HTMLElement | null) ||
      item.el

    snapToPrompt(article)
    setActiveId(id)
    scrollSidebarActiveIntoView(shadowMount, id)

    const focusTextarea = () => {
      const textarea = article.querySelector<HTMLTextAreaElement>('textarea')
      if (textarea) {
        textarea.focus()
        const len = textarea.value.length
        textarea.setSelectionRange(len, len)
      }
    }

    if (article.querySelector('textarea')) {
      focusTextarea()
      return
    }

    const editButton =
      article.querySelector<HTMLButtonElement>(
        'button[aria-label="Edit message"]',
      ) ||
      article.querySelector<HTMLButtonElement>('button[aria-label^="Edit"]')

    if (!editButton) return

    editButton.click()

    requestAnimationFrame(() => {
      requestAnimationFrame(focusTextarea)
    })
  }

  const onCopy = async (id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item) return

    const textToCopy = item.rawText || item.text
    if (!textToCopy) return

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy)
      } else {
        // Fallback: temporary textarea
        const ta = document.createElement('textarea')
        ta.value = textToCopy
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
    } catch (err) {
      console.warn('[prompt-sidebar] Failed to copy prompt', err)
    }
  }

  const changeVersion = (id: string, direction: -1 | 1) => {
    const item = items.find((i) => i.id === id)
    if (!item) return

    const article =
      (item.el.closest('article[data-turn="user"]') as HTMLElement | null) ||
      item.el

    snapToPrompt(article)
    setActiveId(id)
    scrollSidebarActiveIntoView(shadowMount, id)

    const selector =
      direction === -1
        ? 'button[aria-label="Previous response"]'
        : 'button[aria-label="Next response"]'

    const btn = article.querySelector<HTMLButtonElement>(selector)
    if (!btn) return

    const ariaDisabled = btn.getAttribute('aria-disabled')
    if (btn.disabled || ariaDisabled === 'true') return

    btn.click()
  }

  const onPreviousVersion = (id: string) => changeVersion(id, -1)
  const onNextVersion = (id: string) => changeVersion(id, 1)

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

  const OPEN_WIDTH = 320
  const MINI_WIDTH = 52

  useEffect(() => {
    if (!layoutRoot) return

    const prevPaddingRight = layoutRoot.style.paddingRight
    const prevTransition = layoutRoot.style.transition

    const extra = isOpen ? OPEN_WIDTH : MINI_WIDTH
    const base = parseFloat(originalLayoutPaddingRight || '0') || 0

    const t = prevTransition || ''
    if (!t.includes('padding-right')) {
      layoutRoot.style.transition = t
        ? `${t}, padding-right 0.18s ease-out`
        : 'padding-right 0.18s ease-out'
    }

    layoutRoot.style.paddingRight = `${base + extra}px`

    return () => {
      layoutRoot.style.paddingRight = prevPaddingRight
      layoutRoot.style.transition = prevTransition
    }
  }, [layoutRoot, originalLayoutPaddingRight, isOpen])

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
      onEdit={onEdit}
      onCopy={onCopy}
      onPreviousVersion={onPreviousVersion}
      onNextVersion={onNextVersion}
    />
  )
}

async function main() {
  const root = mountSidebar()
  if (!root) return

  const detachThemeSync = attachThemeSync(root.host)

  const hostRemovalObserver = new MutationObserver(() => {
    if (!document.contains(root.host)) {
      detachThemeSync()
      hostRemovalObserver.disconnect()
    }
  })
  hostRemovalObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })

  await loadStyles(root.shadow)

  const mainEl = document.getElementById('main') as HTMLElement | null

  // Chat root for your prompt observation logic
  const chatRoot =
    mainEl?.closest<HTMLElement>('[class*="container/main"]') ??
    mainEl ??
    undefined

  const layoutRoot = findLayoutRoot()

  let originalLayoutPaddingRight = '0px'
  if (layoutRoot instanceof HTMLElement) {
    originalLayoutPaddingRight = getComputedStyle(layoutRoot).paddingRight
  }

  render(
    <App
      shadowMount={root.mount}
      chatRoot={chatRoot instanceof HTMLElement ? chatRoot : undefined}
      layoutRoot={layoutRoot instanceof HTMLElement ? layoutRoot : undefined}
      originalLayoutPaddingRight={originalLayoutPaddingRight}
    />,
    root.mount,
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
