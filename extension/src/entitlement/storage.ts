/**
 * Persistent storage layer for entitlement state.
 *
 * Data is stored in chrome.storage.local under two keys:
 * - navgpt_trial: TrialState
 * - navgpt_license: LicenseState
 *
 * Notes:
 * - Reads return an empty object if nothing is stored yet; callers must handle undefined fields.
 * - Writes replace the entire object; callers should spread the previous value to avoid dropping fields.
 * - Storage is per-browser-profile and survives service worker restarts.
 */

import type { LicenseState, TrialState } from './types'

const TRIAL_KEY = 'navgpt_trial'
const LICENSE_KEY = 'navgpt_license'

export async function getTrial(): Promise<TrialState> {
  const r = await chrome.storage.local.get(TRIAL_KEY)
  return (r[TRIAL_KEY] ?? {}) as TrialState
}
export async function setTrial(trial: TrialState): Promise<void> {
  await chrome.storage.local.set({ [TRIAL_KEY]: trial })
}

export async function getLicense(): Promise<LicenseState> {
  const r = await chrome.storage.local.get(LICENSE_KEY)
  return (r[LICENSE_KEY] ?? {}) as LicenseState
}
export async function setLicense(license: LicenseState): Promise<void> {
  await chrome.storage.local.set({ [LICENSE_KEY]: license })
}

export async function clearLicense(): Promise<void> {
  await chrome.storage.local.remove(LICENSE_KEY)
}
