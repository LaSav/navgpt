import { useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'

type TooltipProps = {
  label: ComponentChildren
  children: ComponentChildren
  placement?: 'top' | 'bottom' | 'bottom-start' | 'bottom-end' | 'left' | 'bottom-offset'
}

export function Tooltip({
  label,
  children,
  placement = 'bottom',
}: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false)
  const tooltipId = `tooltip-${Math.random().toString(36).slice(2)}`

  const show = () => setIsOpen(true)
  const hide = () => setIsOpen(false)

  return (
    <span
      class='tooltip-wrapper'
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusIn={show}
      onFocusOut={hide}
    >
      {/* We can't clone children easily with Preact types, so we wrap instead */}
      <span aria-describedby={isOpen ? tooltipId : undefined}>{children}</span>

      {isOpen && (
        <span
          id={tooltipId}
          role='tooltip'
          class={`tooltip tooltip--${placement}`}
        >
          {label}
        </span>
      )}
    </span>
  )
}
