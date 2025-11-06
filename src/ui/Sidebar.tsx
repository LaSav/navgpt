import { useMemo, useState } from 'preact/hooks'
import type { PromptItem } from '../dom/scrape'

type Props = {
  items: PromptItem[]
  onJump: (id: string) => void
}

export default function Sidebar({ items, onJump }: Props) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return items
    return items.filter((i) => i.text.toLowerCase().includes(s))
  }, [items, q])

  return (
    <div class='container' role='complementary' aria-label='Prompt history'>
      <div class='header'>
        <div class='title'>Prompt history</div>
      </div>

      <div style={{ padding: '.5rem .6rem' }}>
        <input
          class='search'
          placeholder='Filter prompts…'
          value={q}
          onInput={(e: any) => setQ(e.currentTarget.value)}
        />
      </div>

      <div class='list'>
        {filtered.length === 0 && (
          <div style={{ opacity: 0.7, padding: '.6rem' }}>
            No prompts found yet.
          </div>
        )}

        {filtered.map((p, idx) => (
          <button
            class={`item ${p.edits > 0 ? 'item--edited' : ''} ${
              p.isEditing ? 'item--editing' : ''
            }`}
            onClick={() => onJump(p.id)}
            title={
              p.edits > 0
                ? `Edited ${p.edits} time${p.edits > 1 ? 's' : ''} (v${
                    p.currentVersion
                  }/${p.totalVersions})`
                : undefined
            }
          >
            <div class='row'>
              <div class='meta'>#{idx + 1}</div>
              {p.edits > 0 && (
                <span class='badge badge--edits'>
                  {p.currentVersion} / {p.totalVersions}
                </span>
              )}
              {p.isEditing && <span class='badge badge--editing'>editing</span>}
            </div>
            <div class='text'>{p.text}</div>
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
