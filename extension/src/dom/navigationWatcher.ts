import { SEL } from './selectors'

/**
 * Tight "page visibility" watchers:
 * - react to SPA navigation (pushState/replaceState/popstate)
 * - react when thread roots appear/disappear (lightweight MO, not full subtree churn)
 */
export function installNavigationWatcher(onChange: () => void): () => void {
  const win = window as any

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

  notify()

  return () => {
    history.pushState = origPush
    history.replaceState = origReplace
    window.removeEventListener('popstate', onPop)
    window.removeEventListener('hashchange', onPop)
    window.removeEventListener('navgpt:locationchange', onLoc)
    mo.disconnect()
    win.__navgptNavWatcherInstalled = false
  }
}
