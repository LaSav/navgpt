/**
 * Tight "page visibility" watchers:
 * - react to SPA navigation (pushState/replaceState/popstate)
 * - optionally react to coarse DOM structure changes
 */
export function installNavigationWatcher(onChange: () => void): () => void {
  const win = window as any

  if (win.__navgptNavWatcherInstalled) return () => {}
  win.__navgptNavWatcherInstalled = true

  let scheduled = false
  const notify = () => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      onChange()
    })
  }

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
  const onLoc = () => notify()

  window.addEventListener('popstate', onPop)
  window.addEventListener('hashchange', onPop)
  window.addEventListener('navgpt:locationchange', onLoc)

  // Optional coarse fallback only. Do not scan mutation records.
  const mo = new MutationObserver(() => {
    notify()
  })

  mo.observe(document.body ?? document.documentElement, {
    childList: true,
    subtree: false,
  })

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
