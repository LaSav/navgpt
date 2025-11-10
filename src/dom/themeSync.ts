// themeSync.ts
/**
 * Resolve ChatGPT's current theme (light/dark) or fall back to OS "prefers-color-scheme".
 */
export function resolveChatTheme(): 'light' | 'dark' {
  const html = document.documentElement
  const dataTheme =
    html.getAttribute('data-theme') || (html as any).dataset?.theme || ''
  const classList = html.className || ''

  if (/dark/i.test(dataTheme) || /\bdark\b/i.test(classList)) return 'dark'
  if (/light/i.test(dataTheme) || /\blight\b/i.test(classList)) return 'light'

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

/**
 * Keep a host element's data-theme in sync with ChatGPT (and OS when ChatGPT = "System").
 * Returns a detach() to remove listeners.
 */
export function attachThemeSync(hostEl: HTMLElement): () => void {
  const apply = () => hostEl.setAttribute('data-theme', resolveChatTheme())

  // Initial
  apply()

  // Observe ChatGPT UI toggles (classes/attributes on <html>)
  const mo = new MutationObserver(apply)
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'class', 'style'],
  })

  // React to OS changes (relevant when ChatGPT uses "System")
  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  const onMql = () => apply()
  mql.addEventListener('change', onMql)

  // Return cleanup
  return () => {
    mo.disconnect()
    mql.removeEventListener('change', onMql)
  }
}

/**
 * Optional: allow a manual override (e.g., from extension options).
 * Pass 'light' | 'dark' to force, or undefined to resume auto sync.
 */
export function setThemeOverride(
  hostEl: HTMLElement,
  theme?: 'light' | 'dark'
) {
  if (theme) {
    hostEl.setAttribute('data-theme', theme)
    hostEl.setAttribute('data-theme-override', 'true')
  } else {
    hostEl.removeAttribute('data-theme-override')
    // leave current value; attachThemeSync will update on next mutation/OS change
  }
}
