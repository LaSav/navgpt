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

async function scheduleAlarmSoon() {
  await chrome.alarms.create(ALARM_NAME, { delayInMinutes: 1 })
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureTrialStarted(Date.now())
  await ensureInstanceName()
  await ensureAlarmScheduled()
})

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarmScheduled()
})

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return

  const license = await getLicense()
  if (!license.licenseKey) return

  if (!inFlightValidate) {
    inFlightValidate = validateLicense(Date.now(), { force: false }).finally(
      () => {
        inFlightValidate = null
      },
    )
  }
  await inFlightValidate
})

chrome.runtime.onMessage.addListener(
  (msg: NavGPTMessage, _sender, sendResponse) => {
    ;(async () => {
      try {
        const now = Date.now()

        switch (msg?.type) {
          case 'NAVGPT_ENSURE_TRIAL': {
            await ensureTrialStarted(now)
            const state = await getEntitlementState(now)
            sendResponse({ ok: true, state })
            return
          }

          case 'NAVGPT_GET_STATE': {
            const state = await getEntitlementState(now)
            sendResponse({ ok: true, state })
            return
          }

          case 'NAVGPT_VALIDATE': {
            const force = !!msg.force
            if (!inFlightValidate) {
              inFlightValidate = validateLicense(now, { force }).finally(() => {
                inFlightValidate = null
              })
            }
            const validate = await inFlightValidate
            const state = await getEntitlementState(now)
            sendResponse({ ok: true, validate, state })
            return
          }

          case 'NAVGPT_ACTIVATE': {
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

            sendResponse({
              ok: r.ok,
              error: (r as any).error ?? null,
              state,
            })
            return
          }

          case 'NAVGPT_DEACTIVATE': {
            const r = await deactivateCurrentInstance(now)
            const state = await getEntitlementState(now)
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
