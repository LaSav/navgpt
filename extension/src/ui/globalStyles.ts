// src/ui/globalStyles.ts
const GLOBAL_STYLE_ID = 'chatbot-ext-global-styles'
const registry = new Map<string, string>() // key -> css

function ensureGlobalStyleTag(): HTMLStyleElement {
  let tag = document.getElementById(GLOBAL_STYLE_ID) as HTMLStyleElement | null
  if (!tag) {
    tag = document.createElement('style')
    tag.id = GLOBAL_STYLE_ID
    // Keep it early for specificity; head preferred
    ;(document.head || document.documentElement).appendChild(tag)
  }
  return tag
}

function commit() {
  const tag = ensureGlobalStyleTag()
  // Join in insertion order; keys guarantee dedup and easy updates
  tag.textContent = Array.from(registry.values()).join('\n\n')
}

export function setGlobalStyles(key: string, css: string): void {
  registry.set(key, css)
  commit()
}

export function removeGlobalStyles(key: string): void {
  if (registry.delete(key)) commit()
}

export function hasGlobalStyles(key: string): boolean {
  return registry.has(key)
}

export function clearGlobalStyles(): void {
  registry.clear()
  commit()
}
