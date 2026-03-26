import { useEffect, useMemo, useState } from 'preact/hooks'
import type { PromptItem } from '../dom/scrape'
import { Navgpt } from './icons/Navgpt'
import { ArrowUp } from './icons/ArrowUp'
import { ArrowDown } from './icons/ArrowDown'
import { Tooltip } from './Tooltip'
import { Edit } from './icons/Edit'
import { Copy } from './icons/Copy'
import { ArrowLeft } from './icons/ArrowLeft'
import { ArrowRight } from './icons/ArrowRight'
import { ProPanel } from './ProPanel'
import { Settings } from './icons/Settings'
import { Back } from './icons/Back'
import { Collapse } from './icons/Collapse'
import { Locked } from './icons/Locked'
import { Bookmark } from './icons/Bookmark'
import { BookmarkFilled } from './icons/BookmarkFilled'
import { Toast } from './Toast'
import { ResponseArrow } from './icons/ResponseArrow'

const CHECKOUT_URL =
  'https://navgpt.lemonsqueezy.com/checkout/buy/8936bcb2-d8cb-4dd5-9596-1943569a04fe'

type SidebarPromptItem = PromptItem & {
  pinned: boolean
}

type Props = {
  items: SidebarPromptItem[]
  onJump: (id: string) => void
  onJumpToResponse: (promptId: string, responseEl: HTMLElement) => void
  onEdit: (id: string) => void
  onCopy: (id: string) => void
  onTogglePin: (id: string) => void
  onPreviousVersion: (id: string) => void
  onNextVersion: (id: string) => void
  activeId?: string
  isOpen: boolean
  onToggle: () => void
  onNextPrompt: () => void
  onPreviousPrompt: () => void
  onRequirePro?: (message: string) => void
  isPro: boolean
  onEntitlementChange?: () => void
  toast?: {
    message: string
    actionLabel?: string
    onAction?: () => void
  } | null
  onDismissToast?: () => void
  totalCount?: number
}

type View = 'history' | 'settings'

export default function Sidebar({
  items,
  onJump,
  onJumpToResponse,
  onEdit,
  onCopy,
  onTogglePin,
  onPreviousVersion,
  onNextVersion,
  activeId,
  isOpen,
  onToggle,
  onNextPrompt,
  onPreviousPrompt,
  onRequirePro,
  isPro,
  onEntitlementChange,
  toast,
  onDismissToast,
  totalCount,
}: Props) {
  const panelId = 'prompt-history-sidebar'
  const [view, setView] = useState<View>('history')

  const hasItems = items.length > 0
  const currentIndex = activeId ? items.findIndex((i) => i.id === activeId) : -1

  const { canGoPrevious, canGoNext } = useMemo(() => {
    let canGoPrevious = false
    let canGoNext = false

    if (hasItems) {
      if (currentIndex === -1) {
        canGoPrevious = true
        canGoNext = false
      } else {
        canGoPrevious = currentIndex > 0
        canGoNext = currentIndex < items.length - 1
      }
    }

    return { canGoPrevious, canGoNext }
  }, [hasItems, currentIndex, items.length])

  const openSettings = () => {
    setView('settings')
    if (!isOpen) onToggle()
  }

  const openHistory = () => {
    setView('history')
    if (!isOpen) onToggle()
  }

  useEffect(() => {
    if (!isOpen) setView('history')
  }, [isOpen])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // only allow prompt navigation while in history view
      if (view !== 'history') return

      if (e.altKey && e.key === 'ArrowUp') {
        if (!canGoPrevious) return
        e.preventDefault()
        onPreviousPrompt()
        return
      }

      if (e.altKey && e.key === 'ArrowDown') {
        if (!canGoNext) return
        e.preventDefault()
        onNextPrompt()
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [view, onNextPrompt, onPreviousPrompt, canGoNext, canGoPrevious])

  useEffect(() => {
    ;(async () => {
      const { navgptPendingLicense } = await chrome.storage.local.get(
        'navgptPendingLicense',
      )
      if (
        typeof navgptPendingLicense === 'string' &&
        navgptPendingLicense.trim()
      ) {
        setView('settings')
        if (!isOpen) onToggle()
      }
    })()
  }, [])

  return (
    <>
      {/* Mini collapsed rail */}
      <div
        class={`sidebar-mini ${isOpen ? 'sidebar-mini--hidden' : ''}`}
        aria-hidden={isOpen}
      >
        <div class='header header--mini'>
          <Tooltip label='Open prompt history' placement='left'>
            <button
              type='button'
              class='sidebar-mini__button sidebar-mini__button--primary'
              onClick={openHistory}
              aria-label='Expand prompt history'
            >
              <Navgpt size={20} />
            </button>
          </Tooltip>
        </div>

        <Tooltip
          placement='left'
          label={
            <>
              <span class='tooltip-text'>Previous prompt</span>
              <span class='tooltip-shortcut'>⌥↑</span>
            </>
          }
        >
          <button
            type='button'
            class='sidebar-mini__button'
            aria-label='Previous prompt'
            onClick={onPreviousPrompt}
            disabled={!canGoPrevious}
          >
            <ArrowUp size={18} />
          </button>
        </Tooltip>

        <Tooltip
          placement='left'
          label={
            <>
              <span class='tooltip-text'>Next prompt</span>
              <span class='tooltip-shortcut'>⌥↓</span>
            </>
          }
        >
          <button
            type='button'
            class='sidebar-mini__button'
            aria-label='Next prompt'
            onClick={onNextPrompt}
            disabled={!canGoNext}
          >
            <ArrowDown size={18} />
          </button>
        </Tooltip>

        <Tooltip placement='left' label='Settings'>
          <button
            type='button'
            class='sidebar-mini__button'
            onClick={openSettings}
            aria-label='Open settings'
          >
            <Settings size={18} />
          </button>
        </Tooltip>
      </div>

      {/* Full panel */}
      <div
        id={panelId}
        class={`container ${isOpen ? 'container--open' : 'container--closed'}`}
        role='complementary'
        aria-label='Prompt history'
      >
        <div class='header'>
          <div class='header--title'>
            {view === 'history' ? (
              <Navgpt size={20} />
            ) : (
              <>
                <span>Settings</span>
                <Settings size={18} />
              </>
            )}
          </div>

          {/* Left side controls differ by view */}
          {view === 'history' ? (
            <>
              <Tooltip
                label={
                  <>
                    <span class='tooltip-text'>Previous prompt</span>
                    <span class='tooltip-shortcut'>⌥↑</span>
                  </>
                }
              >
                <button
                  type='button'
                  class='header-iconButton'
                  onClick={onPreviousPrompt}
                  aria-label='Previous prompt'
                  disabled={!canGoPrevious}
                >
                  <ArrowUp size={18} />
                </button>
              </Tooltip>

              <Tooltip
                label={
                  <>
                    <span class='tooltip-text'>Next prompt</span>
                    <span class='tooltip-shortcut'>⌥↓</span>
                  </>
                }
              >
                <button
                  type='button'
                  class='header-iconButton'
                  onClick={onNextPrompt}
                  aria-label='Next prompt'
                  disabled={!canGoNext}
                >
                  <ArrowDown size={18} />
                </button>
              </Tooltip>

              <Tooltip label='Settings'>
                <button
                  type='button'
                  class='header-iconButton'
                  onClick={() => setView('settings')}
                  aria-label='Open settings'
                >
                  <Settings size={18} />
                </button>
              </Tooltip>
            </>
          ) : (
            <Tooltip label='Back'>
              <button
                type='button'
                class='header-iconButton'
                onClick={() => setView('history')}
                aria-label='Back to prompts'
              >
                <Back size={18} />
              </button>
            </Tooltip>
          )}

          <Tooltip label='Close'>
            <button class='header-toggle' onClick={onToggle}>
              <Collapse size={20} />
            </button>
          </Tooltip>
        </div>

        {/* Body switches by view */}
        {view === 'history' ? (
          <div class='list'>
            <p class='list--title'>Prompts</p>

            {items.map((p, idx) => {
              const canPrevVersion = p.currentVersion > 1
              const canNextVersion = p.currentVersion < p.totalVersions
              const canPin = !!p.conversationId && !!p.turnId
              const responseEl = p.responseEl
              const canJumpToResponse = p.hasResponse && !!responseEl

              return (
                <div
                  key={p.id}
                  data-prompt-id={p.id}
                  class={`item ${activeId === p.id ? 'item--active' : ''} ${
                    p.pinned ? 'item--pinned' : ''
                  }`}
                  role='button'
                  tabIndex={0}
                  onClick={() => onJump(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onJump(p.id)
                    }
                  }}
                >
                  <div class='item-meta'>
                    <span class='meta--index'>{idx + 1}</span>
                    <button
                      type='button'
                      class='badge__button'
                      onClick={(e) => {
                        e.stopPropagation()
                        onCopy(p.id)
                      }}
                      title='Copy prompt'
                      aria-label='Copy prompt'
                    >
                      <Copy size={12} />
                    </button>

                    <div class='item-footer__center'>
                      {isPro ? (
                        p.edits > 0 && (
                          <div class='edits-controls'>
                            <span class='badge badge--edits'>
                              <button
                                type='button'
                                class='badge__button'
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onPreviousVersion(p.id)
                                }}
                                disabled={!canPrevVersion}
                                aria-label='Previous edit version'
                              >
                                <ArrowLeft />
                              </button>

                              <span
                                class='badge-text'
                                title={`${p.totalVersions} edits`}
                              >
                                {p.currentVersion} / {p.totalVersions}
                              </span>

                              <button
                                type='button'
                                class='badge__button'
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onNextVersion(p.id)
                                }}
                                disabled={!canNextVersion}
                                aria-label='Next edit version'
                              >
                                <ArrowRight />
                              </button>
                            </span>
                          </div>
                        )
                      ) : (
                        <div class='edits-controls'>
                          <button
                            type='button'
                            class='badge__locked-btn badge__btn--iconlabel'
                            onClick={(e) => {
                              e.stopPropagation()
                              onRequirePro?.(
                                'Branch detection & navigation are pro features. Upgrade to access.',
                              )
                            }}
                            title='Version history & branching is available on Pro'
                          >
                            <Locked /> / <Locked />
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      type='button'
                      class='badge__button'
                      onClick={(e) => {
                        e.stopPropagation()
                        onEdit(p.id)
                      }}
                      title='Edit prompt'
                      aria-label='Edit prompt'
                    >
                      <Edit size={12} />
                    </button>
                    <button
                      type='button'
                      class={`badge__button ${p.pinned ? 'badge__button--active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!canPin) return
                        onTogglePin(p.id)
                      }}
                      disabled={!canPin}
                      aria-pressed={p.pinned}
                      aria-label={p.pinned ? 'Unpin prompt' : 'Pin prompt'}
                      title={
                        !canPin
                          ? 'Pin unavailable for this prompt'
                          : p.pinned
                            ? 'Unpin prompt'
                            : 'Pin prompt'
                      }
                    >
                      {p.pinned ? (
                        <BookmarkFilled size={15} />
                      ) : (
                        <Bookmark size={15} />
                      )}
                    </button>
                  </div>

                  <div class='text-row'>
                    <div class='text'>{p.text}</div>
                  </div>
                  {canJumpToResponse && (
                    <button
                      type='button'
                      class='response-link'
                      onClick={(e) => {
                        e.stopPropagation()
                        onJumpToResponse(p.id, responseEl)
                      }}
                      aria-label='Jump to response'
                    >
                      response
                      <ResponseArrow size={14} />
                    </button>
                  )}
                </div>
              )
            })}

            {!isPro && totalCount != null && totalCount > items.length && (
              <div className='visibile-items-hint'>
                Showing last {items.length} prompts of {totalCount}.{' '}
                <a href={CHECKOUT_URL} target='_blank'>
                  Upgrade
                </a>{' '}
                to see all.
              </div>
            )}
          </div>
        ) : (
          <div class='settings-view'>
            <ProPanel onEntitlementChange={onEntitlementChange} />
          </div>
        )}

        <div class='toast-overlay' aria-live='polite'>
          {toast && onDismissToast && (
            <Toast
              message={toast.message}
              actionLabel={toast.actionLabel}
              onAction={toast.onAction}
              onClose={onDismissToast}
            />
          )}
        </div>

        <div class='footer'>
          {view === 'history' ? (
            <>
              <span class='footer--meta'>
                {isPro || totalCount == null ? (
                  <>
                    {items.length} prompt{items.length === 1 ? '' : 's'}
                  </>
                ) : (
                  <>
                    {items.length} / {totalCount} prompt
                    {totalCount === 1 ? '' : 's'}
                  </>
                )}
              </span>
              <a
                class='footer--meta'
                href='https://navgpt.app/contact'
                target='_blank'
                rel='noreferrer'
              >
                Feedback & Support
              </a>
            </>
          ) : (
            <a
              class='footer--meta'
              href='https://navgpt.app/contact'
              target='_blank'
              rel='noreferrer'
            >
              Feedback & Support
            </a>
          )}
        </div>
      </div>
    </>
  )
}
