import type { PromptItem } from '../dom/scrape'

type Props = {
  items: PromptItem[] // ← already filtered by parent
  onJump: (id: string) => void
  activeId?: string
}

export default function Sidebar({ items, onJump, activeId }: Props) {
  return (
    <div class='container' role='complementary' aria-label='Prompt history'>
      <div class='header'>
        <div class='title'>Prompt history</div>
      </div>

      <div class='list'>
        {items.length === 0 && (
          <div style={{ opacity: 0.7, padding: '.6rem' }}>
            No prompts found yet.
          </div>
        )}

        {items.map((p, idx) => (
          <button
            data-prompt-id={p.id}
            class={`item ${activeId === p.id ? 'item--active' : ''}`}
            onClick={() => onJump(p.id)}
          >
            <div class='text-row'>
              <span class='meta--index'>{idx + 1}</span>
              <div class='text'>{p.text}</div>
            </div>

            {(p.edits > 0 || p.isEditing) && (
              <div class='item-badges'>
                {p.edits > 0 && (
                  <span class='badge badge--edits'>
                    {p.currentVersion} / {p.totalVersions}
                  </span>
                )}
                {p.isEditing && (
                  <span class='badge badge--editing'>editing</span>
                )}
              </div>
            )}
          </button>
        ))}
      </div>

      <div class='footer'>
        <span class='meta'>
          {items.length} prompt{items.length === 1 ? '' : 's'}
        </span>
        <span class='meta' style={{ marginLeft: 'auto' }}>
          ⌥P to toggle
        </span>
      </div>
    </div>
  )
}
