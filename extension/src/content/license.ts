function readNavgptLicenseFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  const key = params.get('navgpt_license')
  return key ? key.trim() : null
}

function scrubNavgptLicenseFromUrl() {
  const url = new URL(window.location.href)
  url.searchParams.delete('navgpt_license')

  history.replaceState({}, document.title, url.toString())
}

export async function captureAndScrubIncomingLicense() {
  const key = readNavgptLicenseFromUrl()
  if (!key) return

  await chrome.storage.local.set({ navgptPendingLicense: key })
  scrubNavgptLicenseFromUrl()
}
