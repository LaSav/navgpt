import { useEffect } from 'preact/hooks'
import type { PromptItem } from '../dom/scrape'

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
  }, [onToggle])

  return (
    <>
      {/* Fixed toggle button in top-right of screen */}
      <button
        class={`sidebar-toggle ${isOpen ? 'sidebar-toggle--open' : ''}`}
        type='button'
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        {isOpen ? 'Hide prompts' : 'Show prompts'}
      </button>

      {/* Sliding panel */}
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
            ⟩
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
