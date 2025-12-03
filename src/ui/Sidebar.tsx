import { useEffect } from 'preact/hooks'
import type { PromptItem } from '../dom/scrape'
import { MenuIcon } from './icons/MenuIcon'
import { ArrowUp } from './icons/ArrowUp'
import { ArrowDown } from './icons/ArrowDown'
import { Code } from './icons/Code'
import { Tooltip } from './Tooltip'
import { Edited } from './icons/Edited'

type Props = {
  items: PromptItem[]
  onJump: (id: string) => void
  onEdit: (id: string) => void
  onCopy: (id: string) => void
  activeId?: string
  isOpen: boolean
  onToggle: () => void
  onNextPrompt: () => void
  onPreviousPrompt: () => void
}

export default function Sidebar({
  items,
  onJump,
  onEdit,
  onCopy,
  activeId,
  isOpen,
  onToggle,
  onNextPrompt,
  onPreviousPrompt,
}: Props) {
  const panelId = 'prompt-history-sidebar'

  const hasItems = items.length > 0
  const currentIndex = activeId ? items.findIndex((i) => i.id === activeId) : -1

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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      const isTyping =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (target && target.isContentEditable)

      if (isTyping) return

      if (e.altKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault()
        onToggle()
        return
      }

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
  }, [onToggle, onNextPrompt, onPreviousPrompt, canGoNext, canGoPrevious])

  return (
    <>
      {/* Collapsed mini column */}
      <div
        class={`sidebar-mini ${isOpen ? 'sidebar-mini--hidden' : ''}`}
        aria-hidden={isOpen}
      >
        <div class='header header--mini'>
          <Tooltip label='Open prompt history' placement='left'>
            <button
              type='button'
              class='sidebar-mini__button sidebar-mini__button--primary'
              onClick={onToggle}
              aria-label='Expand prompt history'
            >
              <MenuIcon size={22} />
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
      </div>

      {/* Full panel */}
      <div
        id={panelId}
        class={`container ${isOpen ? 'container--open' : 'container--closed'}`}
        role='complementary'
        aria-label='Prompt history'
      >
        <div class='header'>
          <div class='title'>Prompts</div>

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

          <Tooltip label='Close'>
            <button
              type='button'
              class='header-toggle'
              onClick={onToggle}
              aria-label='Collapse prompt history'
            >
              <MenuIcon size={22} />
            </button>
          </Tooltip>
        </div>

        <div class='list'>
          {items.length === 0 && (
            <div style={{ opacity: 0.7, padding: '.6rem' }}>
              No prompts found.
            </div>
          )}

          {items.map((p, idx) => (
            <div
              key={p.id}
              data-prompt-id={p.id}
              class={`item ${activeId === p.id ? 'item--active' : ''}`}
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

                {p.hasCode && (
                  <span
                    class='badge'
                    title={
                      p.codeLang
                        ? `Contains code (${p.codeLang})`
                        : 'Contains code'
                    }
                  >
                    {p.codeLang ? p.codeLang : <Code size={11} />}
                  </span>
                )}
              </div>

              <div class='text-row'>
                <div class='text'>{p.text}</div>
              </div>

              <div class='item-footer'>
                {p.edits > 0 && (
                  <span
                    class='badge badge--edits'
                    title={`${p.totalVersions} edits`}
                  >
                    <Edited />
                    <span class='badge-text'>
                      {p.currentVersion} / {p.totalVersions}
                    </span>
                  </span>
                )}

                {p.isEditing && (
                  <span class='badge badge--editing'>editing</span>
                )}

                <button
                  type='button'
                  class='badge badge--edit-button'
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit(p.id)
                  }}
                >
                  Edit
                </button>

                <button
                  type='button'
                  class='badge badge--copy-button'
                  onClick={(e) => {
                    e.stopPropagation()
                    onCopy(p.id)
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
          ))}
        </div>

        <div class='footer'>
          <span class='footer--meta'>
            {items.length} prompt{items.length === 1 ? '' : 's'}
          </span>
          <span class='footer--meta' style={{ marginLeft: 'auto' }}>
            Feedback
          </span>
        </div>
      </div>
    </>
  )
}
