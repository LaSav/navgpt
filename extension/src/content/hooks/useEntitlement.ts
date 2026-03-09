import { useEffect, useState } from 'preact/hooks'
import { hasProAccess } from '../../entitlement/gate'
import { isProFromState } from '../entitlement'

export function useEntitlement() {
  const [isPro, setIsPro] = useState(false)

  const refreshIsPro = async () => {
    try {
      setIsPro(await hasProAccess())
    } catch {
      setIsPro(false)
    }
  }

  useEffect(() => {
    refreshIsPro()
  }, [])

  useEffect(() => {
    const handler = (msg: any) => {
      if (msg?.type !== 'NAVGPT_ENTITLEMENT_CHANGED') return

      if (msg.state) {
        setIsPro(isProFromState(msg.state))
        return
      }

      refreshIsPro()
    }

    chrome.runtime.onMessage.addListener(handler)
    return () => chrome.runtime.onMessage.removeListener(handler)
  }, [])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        refreshIsPro()
      }
    }

    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  return {
    isPro,
    refreshIsPro,
  }
}
