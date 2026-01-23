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

  const next: TrialState = {
    trialStartedAt: now,
    trialEndsAt: now + daysToMs(ENTITLEMENT.trialDays),
    trialConsumed: true,
  }
  await setTrial(next)
  return next
}

function paidStatusFromLs(status?: string): PaidStatus {
  if (status === 'disabled') return 'disabled'
  if (status === 'expired') return 'expired'
  if (status === 'active' || status === 'inactive') return 'active'
  return 'none'
}

function compute(
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
    tier = 'expired'
    reason = 'Subscription expired'
  } else if (paidStatus === 'active') {
    tier = 'pro'
    reason = 'Active subscription'
  } else if (trialActive) {
    tier = 'trial'
    reason = 'Trial active'
  }

  // Offline/provider outage grace (only meaningful if there is a paid key stored)
  if (tier !== 'pro' && hasGrace && license.licenseKey && license.instanceId) {
    tier = 'grace'
    reason = 'Offline grace window'
  }

  const proAllowed = tier === 'pro' || tier === 'trial' || tier === 'grace'
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
  return compute(now, trial, license)
}

export async function ensureInstanceName(): Promise<string> {
  const license = await getLicense()
  if (license.instanceName) return license.instanceName

  const instanceName = `chrome-${crypto.randomUUID().slice(0, 8)}`
  await setLicense({ ...license, instanceName })
  return instanceName
}

export async function activateLicenseKey(licenseKey: string, now = Date.now()) {
  const existing = await getLicense()

  // ✅ If we already activated this key on this install, do NOT activate again.
  if (existing.licenseKey === licenseKey && existing.instanceId) {
    const v = await validateLicense(now, { force: true })
    if (!v.ok) return { ok: false as const, error: v.error }
    return { ok: true as const }
  }

  const instanceName = existing.instanceName ?? (await ensureInstanceName())
  const r = await lsActivate(licenseKey, instanceName)

  if (!r.activated || !r.instance?.id) {
    return { ok: false as const, error: r.error ?? 'Activation failed' }
  }

  const paidStatus = paidStatusFromLs(r.license_key?.status)

  const next: LicenseState = {
    ...existing,
    licenseKey,
    instanceName,
    instanceId: r.instance.id,
    paidStatus,
    lastValidatedAt: undefined,
    nextValidateAt: now,
    graceUntil: undefined,
    lastError: null,
  }
  await setLicense(next)

  const v = await validateLicense(now, { force: true })
  if (!v.ok) return { ok: false as const, error: v.error }
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
      const paidStatus = paidStatusFromLs(v.license_key?.status)
      await setLicense({
        ...license,
        paidStatus,
        lastValidatedAt: now,
        nextValidateAt: nextValidateAt(now),
        graceUntil: undefined,
        lastError: v.error ?? 'License invalid',
      })
      return { ok: false, error: v.error ?? 'License invalid' }
    }

    const paidStatus = paidStatusFromLs(v.license_key?.status)

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
    const msg = typeof e?.message === 'string' ? e.message : 'Network error'
    await setLicense({
      ...license,
      nextValidateAt: nextValidateAt(now),
      lastError: msg,
    })
    return { ok: false, error: msg, network: true }
  }
}
