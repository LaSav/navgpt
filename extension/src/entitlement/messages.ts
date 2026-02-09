import type { EntitlementState } from './types'

export type NavGPTMessage =
  | { type: 'NAVGPT_ENSURE_TRIAL' }
  | { type: 'NAVGPT_GET_STATE' }
  | { type: 'NAVGPT_VALIDATE'; force?: boolean }
  | { type: 'NAVGPT_ACTIVATE'; licenseKey: string }

export type ValidateResult =
  | { ok: true }
  | { ok: false; error: string; network?: boolean }

export type NavGPTResponse =
  | { ok: true; state: EntitlementState; validate?: ValidateResult }
  | {
      ok: false
      error: string
      state?: EntitlementState
      validate?: ValidateResult
    }
