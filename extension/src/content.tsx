import { render } from 'preact'
import { useEffect, useRef, useState, useMemo } from 'preact/hooks'
import Sidebar from './ui/Sidebar'
import { observePrompts, scrapePrompts, type PromptItem } from './dom/scrape'
import { attachThemeSync } from './dom/themeSync'
import { hasProAccess, requireProAccess } from './entitlement/gate'
import { consumeDailyQuota } from './entitlement/dailyLimit'
import { shouldShowSidebar } from './dom/page'
import { SEL } from './dom/selectors'

const FREE_VISIBLE_COUNT = 5

/** Helpers for selector constants that include leading '#' */
function idFromSelector(sel: string): string {
  return sel.replace(/^#/, '')
}

/**
 * Find a stable container that includes both the header and main content.
 * We pad this element on the right so the page shifts instead of the sidebar overlapping content.
 */
function findLayoutRoot(): HTMLElement {
  const header = document.querySelector<HTMLElement>(SEL.header)
  const main = document.querySelector<HTMLElement>(SEL.main)

  if (!header || !main) return document.body

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

  // Lowest common ancestor between header and main
  for (let i = headerChain.length - 1; i >= 0; i--) {
    const candidate = headerChain[i]
    if (mainSet.has(candidate)) return candidate
  }

  return document.body
}

function getTopOverlayOffset(): number {
  const header = document.querySelector<HTMLElement>(SEL.header)
  if (!header) return 0

  const pos = getComputedStyle(header).position
  if (pos !== 'sticky' && pos !== 'fixed') return 0

  return header.getBoundingClientRect().height
}

// Load CSS into the shadow root
async function loadStyles(shadow: ShadowRoot) {
  const href = chrome.runtime.getURL('assets/styles.css')

  // Avoid double-inserting if main() runs more than once
  const existing = shadow.querySelector<HTMLLinkElement>(
    `link[rel="stylesheet"][href="${CSS.escape(href)}"]`,
  )
  if (existing) return

  await new Promise<void>((resolve) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href

    link.onload = () => resolve()
    link.onerror = () => {
      console.warn('[prompt-sidebar] Failed to load stylesheet', href)
      resolve() // don’t block mounting forever
    }

    shadow.appendChild(link)
  })
}

// Shadow root mount
function mountSidebar() {
  const hostId = idFromSelector(SEL.sidebarHostId)
  const mountId = idFromSelector(SEL.sidebarMountId)

  if (document.getElementById(hostId)) return null

  const host = document.createElement('div')
  host.id = hostId
  document.body.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })
  const mount = document.createElement('div')
  mount.id = mountId
  shadow.appendChild(mount)

  return { host, shadow, mount }
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
    (targetEl.closest(SEL.userTurn) as HTMLElement | null) ?? targetEl
  if (!article.isConnected) return

  const scroller = getScrollParent(article)

  // 1) Coarse jump: let the browser do the heavy lifting (virtualization/layout will catch up)
  article.scrollIntoView({
    block: 'start',
    inline: 'nearest',
    behavior: 'auto' as ScrollBehavior,
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
        scroller.scrollBy({ top: delta, behavior: 'smooth' })
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

  const list = shadowMount.querySelector(SEL.sidebarList) as HTMLElement | null

  // SEL.sidebarItem is ".item[data-prompt-id]"; derive ".item" so we can add =id
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

/**
 * Tight "page visibility" watchers:
 * - react to SPA navigation (pushState/replaceState/popstate)
 * - react when thread roots appear/disappear (lightweight MO, not full subtree churn)
 */
function installNavigationWatcher(onChange: () => void): () => void {
  const win = window as any

  // Avoid double-install if hot-reloaded
  if (win.__navgptNavWatcherInstalled) return () => {}
  win.__navgptNavWatcherInstalled = true

  const notify = () => onChange()

  const origPush = history.pushState
  const origReplace = history.replaceState

  history.pushState = function (
    this: History,
    ...args: Parameters<History['pushState']>
  ) {
    const r = origPush.apply(this, args)
    window.dispatchEvent(new Event('navgpt:locationchange'))
    return r
  }

  history.replaceState = function (
    this: History,
    ...args: Parameters<History['replaceState']>
  ) {
    const r = origReplace.apply(this, args)
    window.dispatchEvent(new Event('navgpt:locationchange'))
    return r
  }

  const onPop = () => window.dispatchEvent(new Event('navgpt:locationchange'))
  window.addEventListener('popstate', onPop)
  window.addEventListener('hashchange', onPop)

  const onLoc = () => notify()
  window.addEventListener('navgpt:locationchange', onLoc)

  // Lightweight observer: only care about thread roots being added/removed.
  const mo = new MutationObserver((mutations) => {
    let changed = false
    for (const m of mutations) {
      if (m.type !== 'childList') continue
      const nodes = [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)]
      if (
        nodes.some(
          (n) =>
            n instanceof HTMLElement &&
            (n.matches?.(SEL.threadRoots) ||
              !!n.querySelector?.(SEL.threadRoots)),
        )
      ) {
        changed = true
        break
      }
    }
    if (changed) notify()
  })

  mo.observe(document.documentElement, { childList: true, subtree: true })

  // fire once now
  notify()

  return () => {
    // restore history methods
    history.pushState = origPush
    history.replaceState = origReplace
    window.removeEventListener('popstate', onPop)
    window.removeEventListener('hashchange', onPop)
    window.removeEventListener('navgpt:locationchange', onLoc)
    mo.disconnect()
    win.__navgptNavWatcherInstalled = false
  }
}

function App({ shadowMount }: { shadowMount: HTMLElement }) {
  const [items, setItems] = useState<PromptItem[]>(() => scrapePrompts())
  const [activeId, setActiveId] = useState<string | undefined>(undefined)
  const [isOpen, setIsOpen] = useState(true)
  const [isPro, setIsPro] = useState(false)
  const [shouldShow, setShouldShow] = useState(() => shouldShowSidebar())

  const visibleItems = useMemo(() => {
    if (isPro) return items
    return items.slice(-FREE_VISIBLE_COUNT)
  }, [items, isPro])

  const refreshIsPro = async () => {
    try {
      setIsPro(await hasProAccess())
    } catch {
      setIsPro(false)
    }
  }

  useEffect(() => {
    refreshIsPro()
  }, [])

  // Optional but nice: if activeId is no longer visible (free tier), clear it.
  useEffect(() => {
    if (!activeId) return
    if (isPro) return
    if (!visibleItems.some((i) => i.id === activeId)) {
      setActiveId(undefined)
    }
  }, [activeId, isPro, visibleItems])

  const [toast, setToast] = useState<{
    message: string
    actionLabel?: string
    onAction?: () => void
  } | null>(null)

  const scrollerRef = useRef<HTMLElement | null>(
    items[0]?.el ? getScrollParent(items[0].el) : null,
  )

  const openUpgradePage = () => {
    window.open('https://navgpt.app/', '_blank', 'noopener,noreferrer')
  }

  const showLockedToast = (message: string, actionLabel: string) => {
    setToast({
      message,
      actionLabel,
      onAction: () => {
        setToast(null)
        openUpgradePage()
      },
    })
  }

  const requireQuotaOrPro = async (): Promise<boolean> => {
    const pro = await hasProAccess()
    if (pro) return true

    const q = await consumeDailyQuota(1)
    if (!q.ok) {
      showLockedToast(
        "You've reached the daily limit for this action. Upgrade to Pro to continue using this feature.",
        'Upgrade',
      )
      return false
    }
    return true
  }

  const onJump = async (id: string) => {
    const target = items.find((i) => i.id === id)?.el
    if (!target) return

    if (!(await requireQuotaOrPro())) return

    snapToPrompt(target)
    setActiveId(id)
    scrollSidebarActiveIntoView(shadowMount, id)
  }

  const onEdit = async (id: string) => {
    const gate = await requireProAccess()
    if (!gate.ok) {
      showLockedToast(
        'Editing from the side panel is a pro feature. Upgrade to access.',
        'Upgrade',
      )
      return
    }

    const item = visibleItems.find((i) => i.id === id)
    if (!item) return

    const article =
      (item.el.closest(SEL.userTurn) as HTMLElement | null) || item.el

    snapToPrompt(article)
    setActiveId(id)
    scrollSidebarActiveIntoView(shadowMount, id)

    const focusTextarea = () => {
      const textarea = article.querySelector<HTMLTextAreaElement>(SEL.textarea)
      if (textarea) {
        textarea.focus()
        const len = textarea.value.length
        textarea.setSelectionRange(len, len)
      }
    }

    if (article.querySelector(SEL.textarea)) {
      focusTextarea()
      return
    }

    const editButton =
      article.querySelector<HTMLButtonElement>(SEL.editMessageButtonExact) ||
      article.querySelector<HTMLButtonElement>(SEL.editMessageButtonPrefix)

    if (!editButton) return

    editButton.click()
    requestAnimationFrame(() => requestAnimationFrame(focusTextarea))
  }

  const onCopy = async (id: string) => {
    const item = visibleItems.find((i) => i.id === id)
    if (!item) return

    const textToCopy = item.rawText || item.text
    if (!textToCopy) return

    if (!(await requireQuotaOrPro())) return

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy)
      } else {
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

  const changeVersion = async (id: string, direction: -1 | 1) => {
    const gate = await requireProAccess()
    if (!gate.ok) {
      showLockedToast(
        'Branch detection & navigation are pro features. Upgrade to access.',
        'Upgrade',
      )
      return
    }

    const item = visibleItems.find((i) => i.id === id)
    if (!item) return

    const article =
      (item.el.closest(SEL.userTurn) as HTMLElement | null) || item.el

    snapToPrompt(article)
    setActiveId(id)
    scrollSidebarActiveIntoView(shadowMount, id)

    const selector =
      direction === -1 ? SEL.prevResponseButton : SEL.nextResponseButton
    const btn = article.querySelector<HTMLButtonElement>(selector)
    if (!btn) return

    const ariaDisabled = btn.getAttribute('aria-disabled')
    if (btn.disabled || ariaDisabled === 'true') return

    btn.click()
  }

  const onPreviousVersion = (id: string) => changeVersion(id, -1)
  const onNextVersion = (id: string) => changeVersion(id, 1)

  const goToPromptByOffset = (direction: 1 | -1) => {
    if (!visibleItems.length) return

    const currentIndex = activeId
      ? visibleItems.findIndex((i) => i.id === activeId)
      : -1

    const nextIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : visibleItems.length - 1
        : currentIndex + direction

    if (nextIndex < 0 || nextIndex >= visibleItems.length) return
    const nextItem = visibleItems[nextIndex]
    if (nextItem) onJump(nextItem.id)
  }

  const handleNextPrompt = () => goToPromptByOffset(1)
  const handlePreviousPrompt = () => goToPromptByOffset(-1)
  const handleToggle = () => setIsOpen((prev) => !prev)

  // Padding application bookkeeping
  const appliedLayoutRef = useRef<HTMLElement | null>(null)
  const appliedPrevPaddingRef = useRef<string>('')
  const appliedPrevTransitionRef = useRef<string>('')
  const appliedBasePaddingRef = useRef<number>(0)

  useEffect(() => {
    // If sidebar isn't shown on this page, remove any applied padding.
    if (!shouldShow) {
      const prevEl = appliedLayoutRef.current
      if (prevEl && prevEl.isConnected) {
        prevEl.style.paddingRight = appliedPrevPaddingRef.current
        prevEl.style.transition = appliedPrevTransitionRef.current
      }
      appliedLayoutRef.current = null
      return
    }

    const el = findLayoutRoot()
    if (!el || !el.isConnected) return

    const prevEl = appliedLayoutRef.current

    // If we switched layout roots, restore the old one.
    if (prevEl && prevEl !== el && prevEl.isConnected) {
      prevEl.style.paddingRight = appliedPrevPaddingRef.current
      prevEl.style.transition = appliedPrevTransitionRef.current
    }

    // Capture baselines for THIS element once.
    if (prevEl !== el) {
      appliedLayoutRef.current = el
      appliedPrevPaddingRef.current = el.style.paddingRight
      appliedPrevTransitionRef.current = el.style.transition
      appliedBasePaddingRef.current =
        parseFloat(getComputedStyle(el).paddingRight || '0') || 0
    }

    const OPEN_WIDTH = 280
    const MINI_WIDTH = 52
    const extra = isOpen ? OPEN_WIDTH : MINI_WIDTH

    const t = el.style.transition || ''
    if (!t.includes('padding-right')) {
      el.style.transition = t
        ? `${t}, padding-right 0.18s ease-out`
        : 'padding-right 0.18s ease-out'
    }

    // Use baseline (never accumulates)
    el.style.paddingRight = `${appliedBasePaddingRef.current + extra}px`

    return () => {
      if (!el.isConnected) return
      el.style.paddingRight = appliedPrevPaddingRef.current
      el.style.transition = appliedPrevTransitionRef.current
    }
  }, [shouldShow, isOpen])

  useEffect(() => {
    // Tight watchers: navigation + thread root changes
    const uninstall = installNavigationWatcher(() => {
      setShouldShow(shouldShowSidebar())
    })
    return () => uninstall()
  }, [])

  useEffect(() => {
    if (!shouldShow) {
      setItems([])
      return
    }

    const stop = observePrompts((next) => {
      setItems(next)
      const nextScroller = next[0]?.el
        ? getScrollParent(next[0].el)
        : scrollerRef.current
      scrollerRef.current = nextScroller
    }, document)

    return () => stop()
  }, [shouldShow])

  useEffect(() => {
    const onResize = () => {
      scrollerRef.current = items[0]?.el
        ? getScrollParent(items[0].el)
        : scrollerRef.current
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [items])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ok = await hasProAccess()
        if (!cancelled) setIsPro(ok)
      } catch {
        if (!cancelled) setIsPro(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return shouldShow ? (
    <Sidebar
      items={visibleItems}
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
      onRequirePro={(message) => showLockedToast(`${message}`, 'Upgrade')}
      isPro={isPro}
      onEntitlementChange={refreshIsPro}
      toast={toast}
      onDismissToast={() => setToast(null)}
      totalCount={items.length}
    />
  ) : null
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
