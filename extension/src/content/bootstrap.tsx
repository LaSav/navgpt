import { render } from 'preact'
import { attachThemeSync } from '../dom/themeSync'
import { App } from './App'
import { loadShadowStyles, mountSidebarHost } from './mount'

export async function startContentApp() {
  const root = mountSidebarHost()
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

  await loadShadowStyles(root.shadow)

  render(<App shadowMount={root.mount} />, root.mount)

  window.addEventListener('unload', () => {
    detachThemeSync()
  })
}
