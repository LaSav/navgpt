import { render } from 'preact'
import Sidebar from './ui/Sidebar'
import { observePrompts, scrapePrompts, type PromptItem } from './dom/scrape'
import { CHAT_ROOT_SELECTOR } from './dom/selectors'
import { setGlobalStyles } from './ui/globalStyles'

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

// Find the actual scroll container (inner overflow div)
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

// Header offset inside the scroller
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

// SNAP (no animation). Aim at bubble when possible, article during edit (provided by scrapePrompts)
function snapToPrompt(el: HTMLElement) {
  const scroller = getScrollParent(el)
  const offset = getStickyOffsetWithin(scroller) + 16
  const e = el.getBoundingClientRect()
  const s = scroller.getBoundingClientRect()
  const target = scroller.scrollTop + (e.top - s.top) - offset
  scroller.scrollTop = target
  // tiny correction next frame (remains instantaneous visually)
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

async function main() {
  const root = mountSidebar()
  if (!root) return

  await loadStyles(root.shadow)

  // Global CSS (applies to page DOM, e.g., highlight pulse)
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

  // Initial render
  render(<Sidebar items={items} onJump={onJump} />, root.mount)

  // Observe & re-render
  const stop = observePrompts((next) => {
    items = next
    render(<Sidebar items={items} onJump={onJump} />, root.mount)
  })

  // Make space for panel
  const chatRoot = document.querySelector(CHAT_ROOT_SELECTOR)
  if (chatRoot instanceof HTMLElement) {
    chatRoot.style.paddingRight = '330px'
  }

  window.addEventListener('unload', () => stop())
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main)
} else {
  main()
}
