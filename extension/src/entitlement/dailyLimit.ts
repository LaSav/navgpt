const LIMIT = 30
const STORAGE_KEY = 'navgpt_daily_action_quota_v1'

type State = {
  day: string // YYYY-MM-DD in local time
  used: number
}

function dayKeyLocal(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

async function loadState(): Promise<State> {
  const today = dayKeyLocal()
  const res = await chrome.storage.local.get(STORAGE_KEY)
  const s = res?.[STORAGE_KEY] as State | undefined

  if (!s || s.day !== today) {
    const next: State = { day: today, used: 0 }
    await chrome.storage.local.set({ [STORAGE_KEY]: next })
    return next
  }

  return s
}

async function saveState(next: State): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: next })
}

export async function getDailyQuota() {
  const s = await loadState()
  return {
    used: s.used,
    limit: LIMIT,
    remaining: Math.max(0, LIMIT - s.used),
    day: s.day,
  }
}

/**
 * Combined action quota: copy + jump share the same pool.
 * Returns ok=false if limit would be exceeded.
 */
export async function consumeDailyQuota(n = 1) {
  const s = await loadState()
  const nextUsed = s.used + n

  if (nextUsed > LIMIT) {
    return {
      ok: false as const,
      used: s.used,
      limit: LIMIT,
      remaining: Math.max(0, LIMIT - s.used),
      day: s.day,
    }
  }

  const next: State = { ...s, used: nextUsed }
  await saveState(next)

  return {
    ok: true as const,
    used: next.used,
    limit: LIMIT,
    remaining: Math.max(0, LIMIT - next.used),
    day: next.day,
  }
}
