export type PaidStatus = 'none' | 'active' | 'expired' | 'disabled'
export type EntitlementTier =
  | 'free'
  | '14 day free pro trial'
  | 'pro'
  | 'grace'
  | 'expired'
  | 'disabled'

export type TrialState = {
  trialStartedAt?: number // ms
  trialEndsAt?: number // ms
  trialConsumed?: boolean
}

export type LicenseState = {
  licenseKey?: string // store plaintext (trust-first); optionally mask in UI
  instanceName?: string // generated label you send on activation
  instanceId?: string // returned by activation
  paidStatus?: PaidStatus

  lastValidatedAt?: number // ms
  nextValidateAt?: number // ms
  graceUntil?: number // ms

  lastError?: string | null
}

export type EntitlementState = {
  tier: EntitlementTier
  now: number

  trial: TrialState
  license: LicenseState

  // Convenience fields for UI
  proAllowed: boolean
  reason: string
}
