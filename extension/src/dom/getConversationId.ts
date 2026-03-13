export function getConversationId(): string | null {
  try {
    const { pathname } = new URL(window.location.href)
    const match = pathname.match(/\/c\/([^/]+)/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}
