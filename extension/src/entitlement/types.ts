export type PaidStatus = 'none' | 'active' | 'expired' | 'disabled'
export type EntitlementTier =
  | 'free'
  | 'trial'
  | 'pro'
  | 'grace'
  | 'expired'
  | 'disabled'

export type TrialState = {
  trialStartedAt?: number
  trialEndsAt?: number
  trialConsumed?: boolean
}

export type LicenseState = {
  licenseKey?: string
  instanceName?: string // stable per install
  instanceId?: string // returned by activation
  paidStatus?: PaidStatus

  lastValidatedAt?: number
  nextValidateAt?: number
  graceUntil?: number

  lastError?: string | null
}

export type EntitlementState = {
  tier: EntitlementTier
  now: number
  trial: TrialState
  license: LicenseState
  proAllowed: boolean
  reason: string
}
