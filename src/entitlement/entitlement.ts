import type {
  EntitlementState,
  LicenseState,
  PaidStatus,
  TrialState,
} from './types'
import { ENTITLEMENT } from './config'
import { getLicense, getTrial, setLicense, setTrial } from './storage'
import { lsActivate, lsValidate } from './lemonsqueezy'

function daysToMs(days: number) {
  return days * 24 * 60 * 60 * 1000
}
function hoursToMs(hours: number) {
  return hours * 60 * 60 * 1000
}

export async function ensureTrialStarted(
  now = Date.now(),
): Promise<TrialState> {
  const trial = await getTrial()

  if (trial.trialConsumed) return trial

  const startedAt = now
  const endsAt = now + daysToMs(ENTITLEMENT.trialDays)

  const next: TrialState = {
    trialStartedAt: startedAt,
    trialEndsAt: endsAt,
    trialConsumed: true,
  }

  await setTrial(next)
  return next
}

function computePaidStatusFromLicenseKeyStatus(status?: string): PaidStatus {
  if (status === 'disabled') return 'disabled'
  if (status === 'expired') return 'expired'
  if (status === 'active' || status === 'inactive') return 'active'
  return 'none'
}

export function computeEntitlement(
  now: number,
  trial: TrialState,
  license: LicenseState,
): EntitlementState {
  const trialActive = !!trial.trialEndsAt && now < trial.trialEndsAt

  const paidStatus: PaidStatus = license.paidStatus ?? 'none'
  const hasGrace = !!license.graceUntil && now < license.graceUntil

  let tier: EntitlementState['tier'] = 'free'
  let reason = 'Free'

  if (paidStatus === 'disabled') {
    tier = 'disabled'
    reason = 'License disabled'
  } else if (paidStatus === 'expired') {
    if (ENTITLEMENT.courtesyHoursOnExpiry > 0 && hasGrace) {
      tier = 'grace'
      reason = 'Courtesy/grace period'
    } else {
      tier = 'expired'
      reason = 'Subscription expired'
    }
  } else if (paidStatus === 'active') {
    tier = 'pro'
    reason = 'Active subscription'
  } else if (trialActive) {
    tier = '14 day free pro trial'
    reason = 'Trial active'
  }

  // If we previously validated successfully and are offline, allow grace.
  if (
    (paidStatus === 'active' || paidStatus === 'none') &&
    hasGrace &&
    tier !== 'pro'
  ) {
    // Grace is only meaningful if user had a paid license stored.
    if (license.licenseKey && license.instanceId) {
      tier = 'grace'
      reason = 'Offline grace window'
    }
  }

  const proAllowed =
    tier === 'pro' || tier === '14 day free pro trial' || tier === 'grace'

  return { tier, now, trial, license, proAllowed, reason }
}

function nextValidateAt(now: number): number {
  const base = now + daysToMs(ENTITLEMENT.validateEveryDays)
  const jitter = Math.floor(
    Math.random() * hoursToMs(ENTITLEMENT.validateJitterHours),
  )
  return base + jitter
}

export async function getEntitlementState(
  now = Date.now(),
): Promise<EntitlementState> {
  const trial = await getTrial()
  const license = await getLicense()
  return computeEntitlement(now, trial, license)
}

export async function activateLicenseKey(
  licenseKey: string,
  instanceName: string,
  now = Date.now(),
) {
  const r = await lsActivate(licenseKey, instanceName)

  if (!r.activated || !r.instance?.id) {
    return { ok: false as const, error: r.error ?? 'Activation failed' }
  }

  const paidStatus = computePaidStatusFromLicenseKeyStatus(
    r.license_key?.status,
  )

  const next: LicenseState = {
    licenseKey,
    instanceName,
    instanceId: r.instance.id,
    paidStatus,
    lastValidatedAt: undefined,
    nextValidateAt: now, // validate immediately after activation
    graceUntil: undefined,
    lastError: null,
  }

  await setLicense(next)

  // Immediately validate (bind instance)
  const v = await validateLicense(now, { force: true })
  if (!v.ok) {
    return { ok: false as const, error: v.error }
  }

  return { ok: true as const }
}

export async function validateLicense(
  now = Date.now(),
  opts: { force?: boolean } = {},
): Promise<{ ok: true } | { ok: false; error: string; network?: boolean }> {
  const license = await getLicense()
  if (!license.licenseKey) return { ok: false, error: 'No license key saved' }

  const due = !license.nextValidateAt || now >= license.nextValidateAt
  if (!opts.force && !due) return { ok: true }

  try {
    const v = await lsValidate(license.licenseKey, license.instanceId)

    if (!v.valid) {
      // Not valid (expired/disabled/etc)
      const paidStatus = computePaidStatusFromLicenseKeyStatus(
        v.license_key?.status,
      )
      const courtesy =
        ENTITLEMENT.courtesyHoursOnExpiry > 0
          ? now + hoursToMs(ENTITLEMENT.courtesyHoursOnExpiry)
          : undefined

      await setLicense({
        ...license,
        paidStatus,
        lastValidatedAt: now,
        nextValidateAt: nextValidateAt(now),
        graceUntil: courtesy,
        lastError: v.error ?? 'License invalid',
      })

      return { ok: false, error: v.error ?? 'License invalid' }
    }

    // Valid: treat inactive/active as paid active (subscription-backed licenses become expired when sub ends). :contentReference[oaicite:2]{index=2}
    const paidStatus = computePaidStatusFromLicenseKeyStatus(
      v.license_key?.status,
    )

    await setLicense({
      ...license,
      paidStatus,
      lastValidatedAt: now,
      nextValidateAt: nextValidateAt(now),
      graceUntil: now + daysToMs(ENTITLEMENT.graceDays),
      lastError: null,
    })

    return { ok: true }
  } catch (e: any) {
    // Network / fetch failure: allow grace if within window
    const msg = typeof e?.message === 'string' ? e.message : 'Network error'
    await setLicense({
      ...license,
      nextValidateAt: nextValidateAt(now),
      lastError: msg,
    })
    return { ok: false, error: msg, network: true }
  }
}
