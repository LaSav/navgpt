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

export function attachThemeSync(hostEl: HTMLElement): () => void {
  const apply = () => hostEl.setAttribute('data-theme', resolveChatTheme())

  apply()

  const mo = new MutationObserver(apply)
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'class', 'style'],
  })

  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  const onMql = () => apply()
  mql.addEventListener('change', onMql)

  return () => {
    mo.disconnect()
    mql.removeEventListener('change', onMql)
  }
}

export function setThemeOverride(
  hostEl: HTMLElement,
  theme?: 'light' | 'dark'
) {
  if (theme) {
    hostEl.setAttribute('data-theme', theme)
    hostEl.setAttribute('data-theme-override', 'true')
  } else {
    hostEl.removeAttribute('data-theme-override')
  }
}
