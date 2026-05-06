const DISMISSED_KEY = 'navgpt_dismissed_changelog'

export async function isDismissed(id: string): Promise<boolean> {
  const result = await chrome.storage.local.get(DISMISSED_KEY)
  const dismissed: string[] = result[DISMISSED_KEY] ?? []
  return dismissed.includes(id)
}

export async function markDismissed(id: string): Promise<void> {
  const result = await chrome.storage.local.get(DISMISSED_KEY)
  const dismissed: string[] = result[DISMISSED_KEY] ?? []
  if (!dismissed.includes(id)) {
    await chrome.storage.local.set({ [DISMISSED_KEY]: [...dismissed, id] })
  }
}
