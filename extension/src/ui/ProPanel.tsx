import { useEffect, useState } from 'preact/hooks'
import { Rocket } from './icons/Rocket'
import { Locked } from './icons/Locked'
import { Reload } from './icons/Reload'
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

export function ProPanel() {
  const [state, setState] = useState<EntitlementState | null>(null)
  const [licenseKey, setLicenseKey] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // force=false => GET_STATE only
  // force=true  => VALIDATE (network if due/forced)
  async function refresh(force = false) {
    if (!force) {
      const r = await send({ type: 'NAVGPT_GET_STATE' })
      if (r.state) setState(r.state)
      // Don't change error on passive refresh; keep whatever user last saw.
      return
    }

    setBusy('Checking…')
    try {
      const r = await send({ type: 'NAVGPT_VALIDATE', force: true })
      if (r.state) setState(r.state)

      // show error only if hard-failed (not network)
      if (r.validate?.ok === false && r.validate?.network !== true) {
        setError(r.validate?.error ?? 'Validation failed')
      } else {
        setError(null)
      }
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    ;(async () => {
      // Ensure trial exists, then just load cached state (no validation on open)
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
    }
  }

  async function onDeactivate() {
    setBusy('Deactivating…')
    setError(null)
    try {
      const r = await chrome.runtime.sendMessage({ type: 'NAVGPT_DEACTIVATE' })
      if (!r.ok) setError(r.error ?? 'Deactivation failed')
      setState(r.state)
    } finally {
      setBusy(null)
    }
  }

  function onUpgrade() {
    window.open(CHECKOUT_URL, '_blank', 'noopener,noreferrer')
  }

  const tier = state?.tier ?? '…'
  const proAllowed = !!state?.proAllowed
  const reason = state?.reason ?? ''
  const savedKey = state?.license?.licenseKey as string | undefined

  const lv = state?.license?.lastValidatedAt
  const nv = state?.license?.nextValidateAt
  const gu = state?.license?.graceUntil

  const isActivated =
    !!state?.license?.licenseKey &&
    !!state?.license?.instanceId &&
    state?.license?.paidStatus === 'active'

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
        <div class='pro-panel__reason'>{reason}</div>
        {savedKey ? (
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
          <button
            type='button'
            class='pro-panel__btn pro-panel__btn--iconlabel'
            onClick={() => refresh(true)} // explicit validate
            aria-label='Reload status'
            disabled={!!busy}
          >
            <span>Refresh status</span>
            <Reload />
          </button>
        </div>
      ) : (
        <>
          <div class='pro-panel__actions'>
            <button type='button' class='pro-panel__btn' onClick={onUpgrade}>
              Upgrade to Pro
            </button>

            <button
              type='button'
              class='pro-panel__btn pro-panel__btn--iconlabel'
              onClick={() => refresh(true)} // explicit validate
              aria-label='Reload status'
              disabled={!!busy}
            >
              <span>Refresh status</span>
              <Reload />
            </button>
          </div>

          <div class='pro-panel__activate'>
            <input
              class='pro-panel__input'
              value={licenseKey}
              onInput={(e) =>
                setLicenseKey((e.target as HTMLInputElement).value)
              }
              placeholder='Enter License Key'
            />
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
