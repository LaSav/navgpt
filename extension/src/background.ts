/**
 * MV3 Service Worker for NavGPT.
 *
 * Responsibilities:
 * - Bootstrap entitlement state on install (start trial, ensure instance id).
 * - Periodically validate stored license keys via chrome.alarms.
 * - Provide an RPC-style message API for content/UI scripts:
 *   - NAVGPT_ENSURE_TRIAL: create trial record if missing, return entitlement state
 *   - NAVGPT_GET_STATE: return entitlement state
 *   - NAVGPT_VALIDATE: validate license (optionally forced), return result + state
 *   - NAVGPT_ACTIVATE: store/activate a license key, return result + state
 *
 * Notes:
 * - Service workers are ephemeral; all durable state must live in chrome.storage.
 * - Validation/activation are deduplicated using in-flight Promise locks.
 */

import {
  ensureTrialStarted,
  getEntitlementState,
  validateLicense,
  activateLicenseKey,
  ensureInstanceName,
  deactivateCurrentInstance,
} from './entitlement/entitlement'
import { getLicense } from './entitlement/storage'
import type { NavGPTMessage } from './entitlement/messages'
import type { EntitlementState } from './entitlement/types'

const ALARM_NAME = 'navgpt_validate'
const ALARM_PERIOD_MIN = 6 * 60 // every 6 hours

async function ensureAlarmScheduled() {
  await chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 1,
    periodInMinutes: ALARM_PERIOD_MIN,
  })
}

let inFlightValidate: Promise<any> | null = null
let inFlightActivate: Promise<any> | null = null

/**
 * Build a stable signature for entitlement that ignores timestamps,
 * so we only broadcast when something meaningful changes.
 */
function entitlementSig(s?: EntitlementState | null): string {
  if (!s) return 'null'
  const paidStatus = String((s as any).license?.paidStatus ?? '')
  const hasKey = Boolean((s as any).license?.licenseKey)
  const hasInstance = Boolean((s as any).license?.instanceId)
  const tier = String((s as any).tier ?? '')
  const proAllowed = Boolean((s as any).proAllowed)
  const reason = String((s as any).reason ?? '')
  return `${tier}|${proAllowed ? 1 : 0}|${paidStatus}|${hasKey ? 1 : 0}|${
    hasInstance ? 1 : 0
  }|${reason}`
}

function broadcastEntitlementChanged(
  prev: EntitlementState | null,
  next: EntitlementState | null,
) {
  if (entitlementSig(prev) === entitlementSig(next)) return
  // Fire-and-forget. If nobody is listening, it’s harmless.
  try {
    chrome.runtime.sendMessage({
      type: 'NAVGPT_ENTITLEMENT_CHANGED',
      state: next,
    })
  } catch {
    // ignore
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  // install can change state (trial, instance id)
  const now = Date.now()
  const prev = await getEntitlementState(now)

  await ensureTrialStarted(now)
  await ensureInstanceName()
  await ensureAlarmScheduled()

  const next = await getEntitlementState(now)
  broadcastEntitlementChanged(prev, next)
})

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarmScheduled()
})

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return

  const license = await getLicense()
  if (!license.licenseKey) return

  const now = Date.now()
  const prev = await getEntitlementState(now)

  if (!inFlightValidate) {
    inFlightValidate = validateLicense(now, { force: false }).finally(() => {
      inFlightValidate = null
    })
  }

  await inFlightValidate

  const next = await getEntitlementState(now)
  broadcastEntitlementChanged(prev, next)
})

chrome.runtime.onMessage.addListener(
  (msg: NavGPTMessage, _sender, sendResponse) => {
    ;(async () => {
      try {
        const now = Date.now()

        switch (msg?.type) {
          case 'NAVGPT_ENSURE_TRIAL': {
            const prev = await getEntitlementState(now)

            await ensureTrialStarted(now)
            const state = await getEntitlementState(now)

            broadcastEntitlementChanged(prev, state)
            sendResponse({ ok: true, state })
            return
          }

          case 'NAVGPT_GET_STATE': {
            const state = await getEntitlementState(now)
            sendResponse({ ok: true, state })
            return
          }

          case 'NAVGPT_VALIDATE': {
            const prev = await getEntitlementState(now)

            const force = !!msg.force
            if (!inFlightValidate) {
              inFlightValidate = validateLicense(now, { force }).finally(() => {
                inFlightValidate = null
              })
            }
            const validate = await inFlightValidate
            const state = await getEntitlementState(now)

            broadcastEntitlementChanged(prev, state)
            sendResponse({ ok: true, validate, state })
            return
          }

          case 'NAVGPT_ACTIVATE': {
            const prev = await getEntitlementState(now)

            const licenseKey = String((msg as any).licenseKey ?? '').trim()
            if (!licenseKey) {
              const state = await getEntitlementState(now)
              sendResponse({ ok: false, error: 'Missing license key', state })
              return
            }

            if (!inFlightActivate) {
              inFlightActivate = activateLicenseKey(licenseKey, now).finally(
                () => {
                  inFlightActivate = null
                },
              )
            }

            const r = await inFlightActivate
            const state = await getEntitlementState(now)

            broadcastEntitlementChanged(prev, state)
            sendResponse({
              ok: r.ok,
              error: (r as any).error ?? null,
              state,
            })
            return
          }

          case 'NAVGPT_DEACTIVATE': {
            const prev = await getEntitlementState(now)

            const r = await deactivateCurrentInstance(now)
            const state = await getEntitlementState(now)

            broadcastEntitlementChanged(prev, state)
            sendResponse({
              ok: r.ok,
              error: (r as any).error ?? null,
              state,
            })
            return
          }

          default: {
            const state = await getEntitlementState(now)
            sendResponse({ ok: false, error: 'Unknown message type', state })
            return
          }
        }
      } catch (e: any) {
        // never hang callers
        sendResponse({
          ok: false,
          error: String(e?.message ?? e ?? 'Unknown error'),
        })
      }
    })()

    return true
  },
)
