import { useEffect, useState } from 'preact/hooks'
import { Rocket } from './icons/Rocket'
import { Locked } from './icons/Locked'
import { Reload } from './icons/Reload'

const CHECKOUT_URL = 'https://YOUR-LEMONSQUEEZY-CHECKOUT-LINK'

function maskKey(k?: string) {
  if (!k) return ''
  if (k.length <= 8) return '••••••••'
  return `${k.slice(0, 4)}…${k.slice(-4)}`
}

type EntState = any

export function ProPanel() {
  const [state, setState] = useState<EntState | null>(null)
  const [licenseKey, setLicenseKey] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh(force = false) {
    const r = await chrome.runtime.sendMessage({
      type: 'NAVGPT_VALIDATE',
      force,
    })
    setState(r.state)
    // show error if hard-failed
    if (r.validate?.ok === false && r.validate?.network !== true) {
      setError(r.validate?.error ?? 'Validation failed')
    } else {
      setError(null)
    }
  }

  useEffect(() => {
    ;(async () => {
      const r = await chrome.runtime.sendMessage({
        type: 'NAVGPT_ENSURE_TRIAL',
      })
      setState(r.state)
      await refresh(true) // force validate on open
    })()
  }, [])

  async function onActivate() {
    setBusy('Activating…')
    setError(null)
    try {
      const r = await chrome.runtime.sendMessage({
        type: 'NAVGPT_ACTIVATE',
        licenseKey: licenseKey.trim(),
      })
      if (!r.ok) setError(r.error ?? 'Activation failed')
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

  return (
    <div class='pro-panel'>
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

      <div class='pro-panel__actions'>
        <button type='button' class='pro-panel__btn' onClick={onUpgrade}>
          Upgrade to Pro
        </button>
        <button
          type='button'
          class='pro-panel__btn pro-panel__btn--iconlabel'
          onClick={() => refresh(true)}
          aria-label='Reload status'
        >
          <span>Refresh status</span>
          <Reload />
        </button>
      </div>

      <div class='pro-panel__activate'>
        <input
          class='pro-panel__input'
          value={licenseKey}
          onInput={(e) => setLicenseKey((e.target as HTMLInputElement).value)}
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

      {error ? <div class='pro-panel__error'>{error}</div> : null}
    </div>
  )
}
