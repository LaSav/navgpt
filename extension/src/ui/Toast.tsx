import { useEffect } from 'preact/hooks'

type ToastProps = {
  message: string
  actionLabel?: string
  onAction?: () => void
  onClose: () => void
  duration?: number // ms
}

export function Toast({
  message,
  actionLabel,
  onAction,
  onClose,
  duration = 5000,
}: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, duration)
    return () => clearTimeout(t)
  }, [duration, onClose])

  return (
    <div class='toast'>
      <div class='toast__message'>{message}</div>

      <div class='toast__controls'>
        {actionLabel && onAction && (
          <button
            class='toast__action'
            onClick={() => {
              onAction()
              onClose()
            }}
          >
            {actionLabel}
          </button>
        )}

        <button class='toast__close' onClick={onClose} aria-label='Dismiss'>
          dismiss
        </button>
      </div>
    </div>
  )
}
