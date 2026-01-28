type GateResult =
  | { ok: true; state: any }
  | { ok: false; state: any; reason: string }

const STALE_AFTER_MS = 12 * 60 * 60 * 1000 // 12h

async function getState(forceValidate: boolean) {
  const r = await chrome.runtime.sendMessage({
    type: 'NAVGPT_VALIDATE',
    force: forceValidate,
  })
  return r.state
}

/**
 * Ensures Pro access. For paid users, may force validate if stale.
 * Returns a result you can use for UX (banner/toast/etc.)
 */
export async function requireProAccess(opts?: {
  staleAfterMs?: number
  forceNow?: boolean // override: always force validate
}): Promise<GateResult> {
  const staleAfterMs = opts?.staleAfterMs ?? STALE_AFTER_MS

  const state = await getState(false)
  if (state?.proAllowed) return { ok: true, state }

  // No paid key? (Free user after trial)
  const hasKey = !!state?.license?.licenseKey
  if (!hasKey) {
    return { ok: false, state, reason: 'no_license' }
  }

  const now = Date.now()
  const lastValidated = state?.license?.lastValidatedAt ?? 0
  const shouldForce =
    opts?.forceNow === true || now - lastValidated > staleAfterMs

  const state2 = await getState(shouldForce)
  if (state2?.proAllowed) return { ok: true, state: state2 }

  // Paid key exists but not entitled (expired/disabled)
  const tier = state2?.tier
  return { ok: false, state: state2, reason: tier ?? 'not_entitled' }
}

export async function hasProAccess(): Promise<boolean> {
  const state = await getState(false)
  return !!state?.proAllowed
}
