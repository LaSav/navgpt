import { useEffect, useState } from 'preact/hooks'
import { Rocket } from './icons/Rocket'
import { Locked } from './icons/Locked'
import { Reload } from './icons/Reload'
import { EyeOpen } from './icons/EyeOpen'
import { EyeClosed } from './icons/EyeClosed'
import type { EntitlementState } from '../entitlement/types'
import type { NavGPTResponse } from '../entitlement/messages'

const CHECKOUT_URL = 'https://YOUR-LEMONSQUEEZY-CHECKOUT-LINK'

function maskKey(k?: string) {
  if (!k) return ''
  if (k.length <= 8) return '••••••••'
  return `${k.slice(0, 4)}…${k.slice(-4)}`
}

async function send(msg: any): Promise<NavGPTResponse> {
  return (await chrome.runtime.sendMessage(msg)) as NavGPTResponse
}

export function ProPanel({
  onEntitlementChange,
}: {
  onEntitlementChange?: () => void
}) {
  const [state, setState] = useState<EntitlementState | null>(null)
  const [licenseKey, setLicenseKey] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)

  const savedKey = state?.license?.licenseKey as string | undefined
  const isActivated =
    !!state?.license?.licenseKey &&
    !!state?.license?.instanceId &&
    state?.license?.paidStatus === 'active'

  // Repopulate input with stored key when not activated
  useEffect(() => {
    if (!isActivated && savedKey) {
      setLicenseKey(savedKey)
      setShowKey(false) // reset visibility when state changes
    }
  }, [isActivated, savedKey])

  async function refresh(force = false) {
    if (!force) {
      const r = await send({ type: 'NAVGPT_GET_STATE' })
      if (r.state) setState(r.state)
      return
    }

    setBusy('Checking…')
    try {
      const r = await send({ type: 'NAVGPT_VALIDATE', force: true })
      if (r.state) setState(r.state)

      if (r.validate?.ok === false && r.validate?.network !== true) {
        setError(r.validate?.error ?? 'Validation failed')
      } else {
        setError(null)
      }
    } finally {
      setBusy(null)
      onEntitlementChange?.()
    }
  }

  useEffect(() => {
    ;(async () => {
      const r = await send({ type: 'NAVGPT_ENSURE_TRIAL' })
      if (r.state) setState(r.state)
      await refresh(false)
    })()
  }, [])

  async function onActivate() {
    setBusy('Activating…')
    setError(null)
    try {
      const r = await send({
        type: 'NAVGPT_ACTIVATE',
        licenseKey: licenseKey.trim(),
      })
      if (!r.ok) setError(r.error ?? 'Activation failed')
      if (r.state) setState(r.state)
    } finally {
      setBusy(null)
      onEntitlementChange?.()
    }
  }

  async function onDeactivate() {
    setBusy('Deactivating…')
    setError(null)
    try {
      const r = await send({ type: 'NAVGPT_DEACTIVATE' })
      if (!r.ok) setError(r.error ?? 'Deactivation failed')
      setState(r.state ?? null)
    } finally {
      setBusy(null)
      onEntitlementChange?.()
    }
  }

  function onUpgrade() {
    window.open(CHECKOUT_URL, '_blank', 'noopener,noreferrer')
  }

  const tier = state?.tier ?? '…'
  const proAllowed = !!state?.proAllowed
  const reason = state?.reason ?? ''
  const lv = state?.license?.lastValidatedAt
  const nv = state?.license?.nextValidateAt
  const gu = state?.license?.graceUntil

  return (
    <div class='pro-panel'>
      <div class='pro-panel__debug'>
        <div>paidStatus: {String(state?.license?.paidStatus ?? '—')}</div>
        <div>lastValidatedAt: {lv ? new Date(lv).toLocaleString() : '—'}</div>
        <div>nextValidateAt: {nv ? new Date(nv).toLocaleString() : '—'}</div>
        <div>graceUntil: {gu ? new Date(gu).toLocaleString() : '—'}</div>
        <div>lastError: {String(state?.license?.lastError ?? '—')}</div>
      </div>

      <div class='pro-panel__row'>
        <div class='pro-panel__title'>
          <h4>NavGPT Pro</h4>
        </div>
        <div class='pro-panel__busy'>{busy ?? ''}</div>
      </div>

      <div class='pro-panel__status'>
        <div class='status__row'>
          Status: <b>{String(tier)}</b>{' '}
          {proAllowed ? (
            <div class='status__icon--pro'>
              <Rocket />
            </div>
          ) : (
            <div className='status__icon--free'>
              <Locked />
            </div>
          )}
        </div>
        <div class='pro-panel__reason-row'>
          <div class='pro-panel__reason'>{reason}</div>

          <button
            type='button'
            class='pro-panel__reason-refresh'
            onClick={() => refresh(true)}
            aria-label='Refresh status'
            disabled={!!busy}
            title='Refresh status'
          >
            <Reload />
          </button>
        </div>
        {isActivated && savedKey ? (
          <div class='pro-panel__key'>
            Key: <code>{maskKey(savedKey)}</code>
          </div>
        ) : null}
      </div>

      {isActivated ? (
        <div class='pro-panel__actions'>
          <button type='button' class='pro-panel__btn' onClick={onUpgrade}>
            Manage / Upgrade
          </button>
          <button
            type='button'
            class='pro-panel__btn pro-panel__btn--danger'
            onClick={onDeactivate}
            disabled={!!busy}
          >
            Deactivate on this device
          </button>
        </div>
      ) : (
        <>
          <div class='pro-panel__actions'>
            <button type='button' class='pro-panel__btn' onClick={onUpgrade}>
              Upgrade to Pro
            </button>
          </div>

          <div class='pro-panel__activate'>
            {!isActivated && savedKey && (
              <div class='pro-panel__hint'>
                A license key is saved on this device.
              </div>
            )}
            <div class='pro-panel__input-wrap'>
              <input
                class='pro-panel__input pro-panel__input--withicon'
                type={showKey ? 'text' : 'password'}
                value={licenseKey}
                onInput={(e) =>
                  setLicenseKey((e.target as HTMLInputElement).value)
                }
                placeholder='Enter License Key'
              />

              {licenseKey && (
                <button
                  type='button'
                  class='pro-panel__input-iconbtn'
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? 'Hide license key' : 'Show license key'}
                  aria-pressed={showKey}
                >
                  {showKey ? <EyeOpen /> : <EyeClosed />}
                </button>
              )}
            </div>

            <button
              type='button'
              class='pro-panel__btn pro-panel__btn--full'
              onClick={onActivate}
              disabled={!licenseKey.trim() || !!busy}
            >
              Activate
            </button>
          </div>
        </>
      )}

      {error ? <div class='pro-panel__error'>{error}</div> : null}
    </div>
  )
}
