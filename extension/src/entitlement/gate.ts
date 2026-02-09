import type { EntitlementState } from './types'
import type { NavGPTResponse } from './messages'

const STALE_AFTER_MS = 12 * 60 * 60 * 1000

async function send(msg: any): Promise<NavGPTResponse> {
  return (await chrome.runtime.sendMessage(msg)) as NavGPTResponse
}

async function getState(): Promise<EntitlementState> {
  const r = await send({ type: 'NAVGPT_GET_STATE' })
  return r.state!
}

async function validate(force: boolean): Promise<EntitlementState> {
  const r = await send({ type: 'NAVGPT_VALIDATE', force })
  return r.state!
}

type GateResult =
  | { ok: true; state: EntitlementState }
  | { ok: false; state: EntitlementState; reason: string }

/**
 * Ensures Pro access. For paid users, may force validate if stale AND due.
 * Returns a result you can use for UX (banner/toast/etc.)
 */

export async function requireProAccess(opts?: {
  staleAfterMs?: number
  forceNow?: boolean
}): Promise<GateResult> {
  const staleAfterMs = opts?.staleAfterMs ?? STALE_AFTER_MS

  const state = await getState()
  if (state?.proAllowed) return { ok: true, state }

  const hasKey = !!state?.license?.licenseKey
  if (!hasKey) return { ok: false, state, reason: 'no_license' }

  const now = Date.now()
  const lastValidated = state?.license?.lastValidatedAt ?? 0
  const nextValidateAt = state?.license?.nextValidateAt ?? 0

  const stale = now - lastValidated > staleAfterMs
  const due = !nextValidateAt || now >= nextValidateAt

  const shouldForce = opts?.forceNow === true || (stale && due)

  const state2 = await validate(shouldForce)
  if (state2?.proAllowed) return { ok: true, state: state2 }

  return { ok: false, state: state2, reason: state2?.tier ?? 'not_entitled' }
}

export async function hasProAccess(): Promise<boolean> {
  const state = await getState()
  return !!state?.proAllowed
}
