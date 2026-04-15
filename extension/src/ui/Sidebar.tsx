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
import { Settings } from './icons/Settings'
import { Back } from './icons/Back'
import { Collapse } from './icons/Collapse'
import { Bookmark } from './icons/Bookmark'
import { BookmarkFilled } from './icons/BookmarkFilled'
import { Toast } from './Toast'
import { ResponseArrow } from './icons/ResponseArrow'
import { Export } from './icons/Export'

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
  toast?: {
    message: string
    actionLabel?: string
    onAction?: () => void
  } | null
  onDismissToast?: () => void
  onExport: () => void
  chatTitle?: string
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
  toast,
  onDismissToast,
  onExport,
  chatTitle,
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

          {/* Controls differ by view */}
          {view === 'history' ? (
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

        {view === 'history' && (
          <div class='chat-title-row'>
            <span
              class={`chat-title-row__text${!chatTitle ? ' chat-title-row__text--placeholder' : ''}`}
              title={chatTitle || undefined}
            >
              {chatTitle || 'New chat'}
            </span>
            <Tooltip label='Export chat' placement='bottom-end'>
              <button
                type='button'
                class='header-iconButton'
                onClick={onExport}
                aria-label='Export chat'
                disabled={items.length === 0 || !chatTitle}
              >
                <Export size={18} />
              </button>
            </Tooltip>
          </div>
        )}

        {/* Body switches by view */}
        {view === 'history' ? (
          <div class='list'>
            {items.map((p) => {
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
                    <Tooltip label='Edit prompt' placement='bottom-start'>
                      <button
                        type='button'
                        class='badge__button'
                        onClick={(e) => {
                          e.stopPropagation()
                          onEdit(p.id)
                        }}
                        aria-label='Edit prompt'
                      >
                        <Edit size={12} />
                      </button>
                    </Tooltip>
                    <div class='item-meta__center'>
                      {p.edits > 0 && (
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
                      )}
                    </div>
                    <Tooltip
                      label={
                        !canPin
                          ? 'Bookmark unavailable for this prompt'
                          : p.pinned
                            ? 'Remove bookmark'
                            : 'Bookmark prompt'
                      }
                      placement='bottom-end'
                    >
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
                        aria-label={
                          p.pinned ? 'Remove bookmark' : 'Bookmark prompt'
                        }
                      >
                        {p.pinned ? (
                          <BookmarkFilled size={15} />
                        ) : (
                          <Bookmark size={15} />
                        )}
                      </button>
                    </Tooltip>
                  </div>

                  <div class='text-row'>
                    <div class='text'>{p.text}</div>
                  </div>
                  <div class='item-footer'>
                    <Tooltip label='Copy prompt' placement='bottom-start'>
                      <button
                        type='button'
                        class='badge__button'
                        onClick={(e) => {
                          e.stopPropagation()
                          onCopy(p.id)
                        }}
                        aria-label='Copy prompt'
                      >
                        <Copy size={12} />
                      </button>
                    </Tooltip>
                    {canJumpToResponse && (
                      <Tooltip label='Jump to response' placement='bottom-end'>
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
                          <ResponseArrow size={12} />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div class='settings-view'>
            <div class='about-section'>
              <p>NavGPT is open-source software.</p>
              <a
                href='https://github.com/lasav/navgpt'
                target='_blank'
                rel='noreferrer'
                class='footer--meta'
              >
                View on GitHub
              </a>
            </div>
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
                {items.length} prompt{items.length === 1 ? '' : 's'}
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
