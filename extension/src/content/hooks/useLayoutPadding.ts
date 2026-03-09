import { useEffect, useRef } from 'preact/hooks'
import { findLayoutRoot } from '../../dom/layout'

type UseLayoutPaddingParams = {
  shouldShow: boolean
  isOpen: boolean
}

const OPEN_WIDTH = 280
const MINI_WIDTH = 52

export function useLayoutPadding({
  shouldShow,
  isOpen,
}: UseLayoutPaddingParams) {
  const appliedLayoutRef = useRef<HTMLElement | null>(null)
  const appliedPrevPaddingRef = useRef<string>('')
  const appliedPrevTransitionRef = useRef<string>('')
  const appliedBasePaddingRef = useRef<number>(0)

  useEffect(() => {
    if (!shouldShow) {
      const prevEl = appliedLayoutRef.current
      if (prevEl && prevEl.isConnected) {
        prevEl.style.paddingRight = appliedPrevPaddingRef.current
        prevEl.style.transition = appliedPrevTransitionRef.current
      }
      appliedLayoutRef.current = null
      return
    }

    const el = findLayoutRoot()
    if (!el || !el.isConnected) return

    const prevEl = appliedLayoutRef.current

    if (prevEl && prevEl !== el && prevEl.isConnected) {
      prevEl.style.paddingRight = appliedPrevPaddingRef.current
      prevEl.style.transition = appliedPrevTransitionRef.current
    }

    if (prevEl !== el) {
      appliedLayoutRef.current = el
      appliedPrevPaddingRef.current = el.style.paddingRight
      appliedPrevTransitionRef.current = el.style.transition
      appliedBasePaddingRef.current =
        parseFloat(getComputedStyle(el).paddingRight || '0') || 0
    }

    const extra = isOpen ? OPEN_WIDTH : MINI_WIDTH

    const t = el.style.transition || ''
    if (!t.includes('padding-right')) {
      el.style.transition = t
        ? `${t}, padding-right 0.18s ease-out`
        : 'padding-right 0.18s ease-out'
    }

    el.style.paddingRight = `${appliedBasePaddingRef.current + extra}px`

    return () => {
      if (!el.isConnected) return
      el.style.paddingRight = appliedPrevPaddingRef.current
      el.style.transition = appliedPrevTransitionRef.current
    }
  }, [shouldShow, isOpen])
}
