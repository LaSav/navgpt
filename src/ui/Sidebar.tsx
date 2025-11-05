import { useEffect, useMemo, useState } from 'preact/hooks'
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
          <button class='item' onClick={() => onJump(p.id)}>
            <div class='meta'>#{idx + 1}</div>
            <div>{p.text}</div>
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
