import { useEffect } from 'preact/hooks'

type ToastProps = {
  title?: string
  message: string
  actionLabel?: string
  onAction?: () => void
  onClose: () => void
  duration?: number // ms
}

export function Toast({
  title,
  message,
  actionLabel,
  onAction,
  onClose,
  duration = 5000,
}: ToastProps) {
  useEffect(() => {
    if (!duration) return
    const t = setTimeout(onClose, duration)
    return () => clearTimeout(t)
  }, [duration, onClose])

  return (
    <div class='toast'>
      {title && <div class='toast__title'>{title}</div>}
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
          Dismiss
        </button>
      </div>
    </div>
  )
}
