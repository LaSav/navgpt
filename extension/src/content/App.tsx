import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import Sidebar from '../ui/Sidebar'
import { observePrompts, scrapePrompts, type PromptItem } from '../dom/scrape'
import { requireProAccess } from '../entitlement/gate'
import { shouldShowSidebar } from '../dom/page'
import { SEL } from '../dom/selectors'
import { CHECKOUT_URL, FREE_VISIBLE_COUNT } from './constants'
import { installNavigationWatcher } from '../dom/navigationWatcher'
import {
  getScrollParent,
  scrollSidebarActiveIntoView,
  snapToPrompt,
  snapToElement,
} from '../dom/scroll'
import { useEntitlement } from './hooks/useEntitlement'
import { useLayoutPadding } from './hooks/useLayoutPadding'
import {
  PROMPT_META_STORAGE_KEY,
  type PersistedState,
  getPromptMeta,
  loadState,
  togglePinned,
} from '../storage/promptMeta'

type ToastState = {
  message: string
  actionLabel?: string
  onAction?: () => void
} | null

type SidebarPromptItem = PromptItem & {
  pinned: boolean
}

export function App({ shadowMount }: { shadowMount: HTMLElement }) {
  const [items, setItems] = useState<PromptItem[]>(() => scrapePrompts())
  const [metaState, setMetaState] = useState<PersistedState>()
  const [activeId, setActiveId] = useState<string | undefined>(undefined)
  const [isOpen, setIsOpen] = useState(true)
  const [shouldShow, setShouldShow] = useState(() => shouldShowSidebar())
  const [toast, setToast] = useState<ToastState>(null)
  const [pageEpoch, setPageEpoch] = useState(0)

  const { isPro, refreshIsPro } = useEntitlement()

  const visibleItems = useMemo<SidebarPromptItem[]>(() => {
    const merged = items.map((item) => {
      const meta = getPromptMeta(metaState, item.conversationId, item.turnId)

      return {
        ...item,
        pinned: !!meta?.pinned,
      }
    })

    if (isPro) return merged
    return merged.slice(-FREE_VISIBLE_COUNT)
  }, [items, isPro, metaState])

  const scrollerRef = useRef<HTMLElement | null>(
    items[0]?.el ? getScrollParent(items[0].el) : null,
  )

  useLayoutPadding({ shouldShow, isOpen })

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      const state = await loadState()
      if (!cancelled) {
        setMetaState(state)
      }
    }

    void init()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const handleStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'local') return

      const change = changes[PROMPT_META_STORAGE_KEY]
      if (!change) return

      setMetaState(
        (change.newValue as PersistedState | undefined) ?? {
          conversations: {},
        },
      )
    }

    chrome.storage.onChanged.addListener(handleStorageChanged)

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChanged)
    }
  }, [])

  useEffect(() => {
    if (!activeId) return
    if (isPro) return
    if (!visibleItems.some((i) => i.id === activeId)) {
      setActiveId(undefined)
    }
  }, [activeId, isPro, visibleItems])

  const openUpgradePage = () => {
    window.open(CHECKOUT_URL, '_blank', 'noopener,noreferrer')
  }

  const showLockedToast = (message: string, actionLabel: string) => {
    setToast({
      message,
      actionLabel,
      onAction: () => {
        setToast(null)
        openUpgradePage()
      },
    })
  }

  const focusPromptInUi = (id: string, el: HTMLElement) => {
    snapToPrompt(el)
    setActiveId(id)
    scrollSidebarActiveIntoView(shadowMount, id)
  }

  const onJump = async (id: string) => {
    const target = items.find((i) => i.id === id)?.el
    if (!target) return

    focusPromptInUi(id, target)
  }

  const onJumpToResponse = (promptId: string, responseEl: HTMLElement) => {
    snapToElement(responseEl, {
      initialBehavior: 'auto',
    })
    setActiveId(promptId)
    scrollSidebarActiveIntoView(shadowMount, promptId)
  }

  const onEdit = async (id: string) => {
    const item = visibleItems.find((i) => i.id === id)
    if (!item) return

    const article =
      (item.el.closest(SEL.userTurn) as HTMLElement | null) || item.el

    focusPromptInUi(id, article)

    const focusTextarea = () => {
      const textarea = article.querySelector<HTMLTextAreaElement>(SEL.textarea)
      if (textarea) {
        textarea.focus()
        const len = textarea.value.length
        textarea.setSelectionRange(len, len)
      }
    }

    if (article.querySelector(SEL.textarea)) {
      focusTextarea()
      return
    }

    const editButton =
      article.querySelector<HTMLButtonElement>(SEL.editMessageButtonExact) ||
      article.querySelector<HTMLButtonElement>(SEL.editMessageButtonPrefix)

    if (!editButton) return

    editButton.click()
    requestAnimationFrame(() => requestAnimationFrame(focusTextarea))
  }

  const onCopy = async (id: string) => {
    const item = visibleItems.find((i) => i.id === id)
    if (!item) return

    const textToCopy = item.rawText || item.text
    if (!textToCopy) return

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy)
      } else {
        const ta = document.createElement('textarea')
        ta.value = textToCopy
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
    } catch (err) {
      console.warn('[prompt-sidebar] Failed to copy prompt', err)
    }
  }

  const onTogglePin = useCallback(
    async (id: string) => {
      const item = items.find((i) => i.id === id)
      if (!item) return

      if (!item.conversationId || !item.turnId) return

      try {
        const next = await togglePinned(item.conversationId, item.turnId)
        setMetaState(next)
      } catch (err) {
        console.warn('[prompt-sidebar] Failed to toggle pinned state', err)
      }
    },
    [items],
  )

  const changeVersion = async (id: string, direction: -1 | 1) => {
    const gate = await requireProAccess()
    if (!gate.ok) {
      showLockedToast(
        'Branch detection & navigation are pro features. Upgrade to access.',
        'Upgrade',
      )
      return
    }

    const item = visibleItems.find((i) => i.id === id)
    if (!item) return

    const article =
      (item.el.closest(SEL.userTurn) as HTMLElement | null) || item.el

    focusPromptInUi(id, article)

    const selector =
      direction === -1 ? SEL.prevResponseButton : SEL.nextResponseButton
    const btn = article.querySelector<HTMLButtonElement>(selector)
    if (!btn) return

    const ariaDisabled = btn.getAttribute('aria-disabled')
    if (btn.disabled || ariaDisabled === 'true') return

    btn.click()
  }

  const onPreviousVersion = (id: string) => changeVersion(id, -1)
  const onNextVersion = (id: string) => changeVersion(id, 1)

  const goToPromptByOffset = (direction: 1 | -1) => {
    if (!visibleItems.length) return

    const currentIndex = activeId
      ? visibleItems.findIndex((i) => i.id === activeId)
      : -1

    const nextIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : visibleItems.length - 1
        : currentIndex + direction

    if (nextIndex < 0 || nextIndex >= visibleItems.length) return
    const nextItem = visibleItems[nextIndex]
    if (nextItem) onJump(nextItem.id)
  }

  const handleNextPrompt = () => goToPromptByOffset(1)
  const handlePreviousPrompt = () => goToPromptByOffset(-1)
  const handleToggle = () => setIsOpen((prev) => !prev)

  useEffect(() => {
    const uninstall = installNavigationWatcher(() => {
      setShouldShow(shouldShowSidebar())
      setPageEpoch((n) => n + 1)
    })
    return () => uninstall()
  }, [])

  useEffect(() => {
    if (!shouldShow) {
      setItems([])
      setActiveId(undefined)
      return
    }

    const stop = observePrompts((next) => {
      setItems((prev) => {
        const prevById = new Map(prev.map((item) => [item.id, item]))

        return next.map((item) => {
          const prevItem = prevById.get(item.id)
          const isTransientEmpty =
            (!item.rawText || !item.rawText.trim()) &&
            (!item.text || !item.text.trim())

          if (isTransientEmpty && prevItem) {
            return {
              ...item,
              rawText: prevItem.rawText,
              text: prevItem.text,
              hasResponse: item.hasResponse ?? prevItem.hasResponse,
              responseEl: item.responseEl ?? prevItem.responseEl,
            }
          }

          return item
        })
      })

      const nextScroller = next[0]?.el
        ? getScrollParent(next[0].el)
        : scrollerRef.current
      scrollerRef.current = nextScroller
    }, document)

    return () => stop()
  }, [shouldShow, pageEpoch])

  useEffect(() => {
    const onResize = () => {
      scrollerRef.current = items[0]?.el
        ? getScrollParent(items[0].el)
        : scrollerRef.current
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [items])

  return shouldShow ? (
    <Sidebar
      items={visibleItems}
      onJump={onJump}
      onJumpToResponse={onJumpToResponse}
      activeId={activeId}
      isOpen={isOpen}
      onToggle={handleToggle}
      onNextPrompt={handleNextPrompt}
      onPreviousPrompt={handlePreviousPrompt}
      onEdit={onEdit}
      onCopy={onCopy}
      onTogglePin={onTogglePin}
      onPreviousVersion={onPreviousVersion}
      onNextVersion={onNextVersion}
      onRequirePro={(message) => showLockedToast(`${message}`, 'Upgrade')}
      isPro={isPro}
      onEntitlementChange={refreshIsPro}
      toast={toast}
      onDismissToast={() => setToast(null)}
      totalCount={items.length}
    />
  ) : null
}
