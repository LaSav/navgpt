import {
  ensureTrialStarted,
  getEntitlementState,
  validateLicense,
  activateLicenseKey,
  ensureInstanceName,
} from './entitlement/entitlement'
import { getLicense } from './entitlement/storage'

console.log('[navgpt] SW start')

const ALARM_NAME = 'navgpt_validate'
let inFlightValidate: Promise<any> | null = null
let inFlightActivate: Promise<any> | null = null

async function scheduleAlarmSoon() {
  await chrome.alarms.create(ALARM_NAME, { delayInMinutes: 1 })
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureTrialStarted(Date.now())
  await ensureInstanceName()
  await scheduleAlarmSoon()
})

chrome.runtime.onStartup.addListener(async () => {
  await scheduleAlarmSoon()
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  ;(async () => {
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
        console.log('[navgpt] msg', msg.type)
        const force = !!msg.force
        if (!inFlightValidate) {
          inFlightValidate = validateLicense(now, { force }).finally(() => {
            inFlightValidate = null
          })
        }
        const r = await inFlightValidate
        const state = await getEntitlementState(now)
        sendResponse({ ok: true, validate: r, state })
        return
      }

      case 'NAVGPT_ACTIVATE': {
        console.log('[navgpt] msg', msg.type)

        const licenseKey = String(msg.licenseKey ?? '').trim()
        if (!licenseKey) {
          sendResponse({ ok: false, error: 'Missing license key' })
          return
        }

        if (!inFlightActivate) {
          inFlightActivate = activateLicenseKey(licenseKey, now).finally(() => {
            inFlightActivate = null
          })
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

      default:
        sendResponse({ ok: false, error: 'Unknown message type' })
        return
    }
  })()

  return true
})
