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
