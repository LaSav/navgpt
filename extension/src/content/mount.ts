import { SEL } from '../dom/selectors'

function idFromSelector(sel: string): string {
  return sel.replace(/^#/, '')
}

export async function loadShadowStyles(shadow: ShadowRoot) {
  const href = chrome.runtime.getURL('assets/styles.css')

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
      resolve()
    }

    shadow.appendChild(link)
  })
}

export function mountSidebarHost() {
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
