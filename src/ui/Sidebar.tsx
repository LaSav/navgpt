import { useEffect } from 'preact/hooks'
import type { PromptItem } from '../dom/scrape'
import { MenuIcon } from './icons/MenuIcon'
import { ArrowUp } from './icons/ArrowUp'
import { ArrowDown } from './icons/ArrowDown'

type Props = {
  items: PromptItem[]
  onJump: (id: string) => void
  activeId?: string
  isOpen: boolean
  onToggle: () => void
}

export default function Sidebar({
  items,
  onJump,
  activeId,
  isOpen,
  onToggle,
}: Props) {
  const panelId = 'prompt-history-sidebar'

  // ⌥H to toggle
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'h' || e.key === 'H') && e.altKey) {
        e.preventDefault()
        onToggle()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // `onToggle` is stable enough for this usage; omitting deps avoids re-adding
  }, [])

  return (
    <>
      {/* Collapsed mini column on the right when sidebar is closed */}
      <div
        class={`sidebar-mini ${isOpen ? 'sidebar-mini--hidden' : ''}`}
        aria-hidden={isOpen}
      >
        {/* EXPAND button at the top */}
        <div class='header header--mini'>
          <button
            type='button'
            class='sidebar-mini__button sidebar-mini__button--primary'
            onClick={onToggle}
            aria-label='Expand prompt history'
          >
            <MenuIcon size={18} />
          </button>
        </div>

        {/* The other two fill the remaining space equally */}
        <button
          type='button'
          class='sidebar-mini__button'
          aria-label='Previous prompt'
        >
          <ArrowUp size={18} />
        </button>

        <button
          type='button'
          class='sidebar-mini__button'
          aria-label='Next prompt'
        >
          <ArrowDown size={18} />
        </button>
      </div>

      {/* Sliding full panel */}
      <div
        id={panelId}
        class={`container ${isOpen ? 'container--open' : 'container--closed'}`}
        role='complementary'
        aria-label='Prompt history'
      >
        <div class='header'>
          <div class='title'>Prompt history</div>

          {/* In-panel collapse button */}
          <button
            type='button'
            class='header-toggle'
            onClick={onToggle}
            aria-label='Collapse prompt history'
          >
            <MenuIcon size={18} />
          </button>
        </div>

        <div class='list'>
          {items.length === 0 && (
            <div style={{ opacity: 0.7, padding: '.6rem' }}>
              No prompts found yet.
            </div>
          )}

          {items.map((p, idx) => (
            <button
              key={p.id}
              data-prompt-id={p.id}
              class={`item ${activeId === p.id ? 'item--active' : ''}`}
              onClick={() => onJump(p.id)}
            >
              <div class='text-row'>
                <span class='meta--index'>{idx + 1}</span>
                <div class='text'>{p.text}</div>
              </div>

              <div class='item-badges'>
                {p.hasCode && (
                  <span
                    class='badge'
                    title={
                      p.codeLang
                        ? `Contains code (${p.codeLang})`
                        : 'Contains code'
                    }
                  >
                    {p.codeLang ? p.codeLang : '</>'}
                  </span>
                )}

                {p.edits > 0 && (
                  <span class='badge badge--edits'>
                    {p.currentVersion} / {p.totalVersions}
                  </span>
                )}

                {p.isEditing && (
                  <span class='badge badge--editing'>editing</span>
                )}
              </div>
            </button>
          ))}
        </div>

        <div class='footer'>
          <span class='meta'>
            {items.length} prompt{items.length === 1 ? '' : 's'}
          </span>
          <span class='meta' style={{ marginLeft: 'auto' }}>
            ⌥H to toggle
          </span>
        </div>
      </div>
    </>
  )
}
