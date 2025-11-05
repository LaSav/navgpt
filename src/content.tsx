import { render } from 'preact'
import Sidebar from './ui/Sidebar'
import { observePrompts, scrapePrompts, type PromptItem } from './dom/scrape'
import { CHAT_ROOT_SELECTOR } from './dom/selectors'

// Load CSS from /public/assets/styles.css into the shadow root
async function loadStyles(shadow: ShadowRoot) {
  const url = chrome.runtime.getURL('assets/styles.css')
  const css = await fetch(url).then((r) => r.text())
  const style = document.createElement('style')
  style.textContent = css
  shadow.appendChild(style)
}

// Mount a shadow-root sidebar so we don't collide with site styles.
function mountSidebar() {
  // Don’t double-inject
  if (document.getElementById('prompt-sidebar-root')) return null

  const host = document.createElement('div')
  host.id = 'prompt-sidebar-root'
  host.style.all = 'initial'
  document.documentElement.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })

  const mount = document.createElement('div')
  shadow.appendChild(mount)

  return { shadow, mount }
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
  // Fallback to the page, but your case uses an inner scroller:
  return (document.scrollingElement as HTMLElement) || document.documentElement
}

function getStickyOffsetWithin(scroller: HTMLElement): number {
  // Try CSS var used by ChatGPT layout, e.g. --header-height
  const cs = getComputedStyle(scroller)
  const varVal = cs.getPropertyValue('--header-height').trim()
  const fromVar = varVal ? parseFloat(varVal) : 0

  if (fromVar) return fromVar

  // Fallback: measure a known top bar inside the scroller if present
  const header = scroller.querySelector<HTMLElement>(
    'header, nav, [data-testid="top-bar"]'
  )
  return header ? header.getBoundingClientRect().height : 0
}

function snapToPrompt(el: HTMLElement) {
  const scroller = getScrollParent(el)
  const offset = getStickyOffsetWithin(scroller) + 16 // breathing room

  // Position of el relative to scroller’s content box
  const elRect = el.getBoundingClientRect()
  const scRect = scroller.getBoundingClientRect()
  const targetTop = scroller.scrollTop + (elRect.top - scRect.top) - offset

  // Single, instantaneous jump (no animation)
  scroller.scrollTop = targetTop

  // Optional: one-frame re-measure to correct tiny residual error
  // (still instant—no visible animation)
  requestAnimationFrame(() => {
    const e2 = el.getBoundingClientRect()
    const s2 = scroller.getBoundingClientRect()
    const residual = e2.top - s2.top - offset
    if (Math.abs(residual) > 1) {
      scroller.scrollTop = scroller.scrollTop + residual
    }
  })
}

function highlightAndScrollTo(el: HTMLElement) {
  snapToPrompt(el)
  el.classList.add('highlight-pulse')
  setTimeout(() => el.classList.remove('highlight-pulse'), 1700)
}

async function main() {
  const root = mountSidebar()
  if (!root) return

  await loadStyles(root.shadow)

  let items: PromptItem[] = scrapePrompts()

  const onJump = (id: string) => {
    const target = items.find((i) => i.id === id)?.el
    if (target) highlightAndScrollTo(target)
  }

  // Keyboard toggle (Alt+P)
  document.addEventListener('keydown', (e) => {
    if (
      (e.altKey || e.metaKey) &&
      !e.shiftKey &&
      !e.ctrlKey &&
      e.key.toLowerCase() === 'p'
    ) {
      const container = root.mount.querySelector(
        '.container'
      ) as HTMLElement | null
      if (container) {
        container.style.display =
          container.style.display === 'none' ? 'flex' : 'none'
      }
    }
  })

  // Render initial UI
  render(<Sidebar items={items} onJump={onJump} />, root.mount)

  // Observe DOM mutations and refresh list
  const stop = observePrompts((next) => {
    items = next
    render(<Sidebar items={items} onJump={onJump} />, root.mount)
  })

  // Optional: anchor the panel against main chat container (not strictly needed since fixed)
  const chatRoot = document.querySelector(CHAT_ROOT_SELECTOR)
  if (chatRoot instanceof HTMLElement) {
    chatRoot.style.paddingRight = '330px' // make space for the panel
  }

  // Cleanup on navigation (SPA-style route changes)
  window.addEventListener('unload', () => stop())
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main)
} else {
  main()
}
