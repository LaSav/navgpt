import { getTurnRawText, isEditorFocusedIn } from './scrape'
import { snapToElement } from './scroll'

const HYDRATE_WAIT_MS = 250

/** True if a turn has no readable text yet (not yet mounted by ChatGPT). */
export function isTurnTextEmpty(article: HTMLElement): boolean {
  return !getTurnRawText(article).trim()
}

/**
 * Resolves once `article`'s content mounts (or its own node is
 * replaced/removed by a virtualizer), or once `timeoutMs` elapses —
 * whichever comes first. Observes both the node itself (content mounting
 * in place) and its parent (node being swapped out entirely), since we
 * don't know which mechanism ChatGPT uses.
 */
function waitForMutation(article: HTMLElement, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false

    const finish = () => {
      if (done) return
      done = true
      childObserver.disconnect()
      parentObserver?.disconnect()
      window.clearTimeout(timer)
      resolve()
    }

    const childObserver = new MutationObserver(finish)
    childObserver.observe(article, { childList: true, subtree: true })

    const parentObserver = article.parentElement ? new MutationObserver(finish) : null
    if (parentObserver && article.parentElement) {
      parentObserver.observe(article.parentElement, { childList: true })
    }

    const timer = window.setTimeout(finish, timeoutMs)
  })
}

function findByTurnId(turnId: string, scrapeRoot: ParentNode): HTMLElement | null {
  return scrapeRoot.querySelector<HTMLElement>(
    `[data-turn-id="${CSS.escape(turnId)}"]`,
  )
}

/**
 * Forces a single turn's content to mount by moving the real scroll
 * position to it, then waiting briefly for ChatGPT to render it. Re-queries
 * the turn by `data-turn-id` afterward in case the original node reference
 * was swapped out by a virtualizer, rather than trusting it's still current.
 *
 * Returns the (possibly re-queried) turn element, or null if it could no
 * longer be found.
 */
export async function hydrateTurn(
  article: HTMLElement,
  scrollEl: HTMLElement,
  scrapeRoot: ParentNode,
): Promise<HTMLElement | null> {
  if (!isTurnTextEmpty(article)) return article

  snapToElement(article, { scroller: scrollEl })
  await waitForMutation(article, HYDRATE_WAIT_MS)

  if (article.isConnected) return article

  const turnId = article.getAttribute('data-turn-id')
  return turnId ? findByTurnId(turnId, scrapeRoot) : null
}

export type HydrateThreadOptions = {
  onProgress?: (done: number, total: number) => void
}

/**
 * Sweeps every turn in `turns` that doesn't yet have text, forcing it to
 * mount one at a time via real scroll movement. Restores `scrollEl`'s
 * original scroll position when done (or on early exit). No-ops entirely
 * if an editor is currently focused inside `scrapeRoot`, so an in-progress
 * edit is never interrupted.
 *
 * Returns a map of `data-turn-id` -> text captured at the moment each turn
 * was hydrated (before the scroll position is restored). Keyed by turn id
 * rather than element reference, since a virtualizer may recycle/replace
 * the DOM node for a given turn between this sweep and a later re-scrape.
 * Callers that need a reliable snapshot (e.g. export) should read from this
 * map rather than re-scraping afterward, in case ChatGPT re-collapses a
 * turn once it's no longer near the (restored) viewport. Turns without a
 * `data-turn-id` are skipped (can't be reliably matched back up later).
 */
export async function hydrateThread(
  turns: HTMLElement[],
  scrollEl: HTMLElement,
  scrapeRoot: ParentNode,
  opts: HydrateThreadOptions = {},
): Promise<Map<string, string>> {
  const captured = new Map<string, string>()

  if (isEditorFocusedIn(scrapeRoot)) return captured

  const startScrollTop = scrollEl.scrollTop

  const capture = (article: HTMLElement) => {
    const turnId = article.getAttribute('data-turn-id')
    if (turnId) captured.set(turnId, getTurnRawText(article))
  }

  try {
    let done = 0
    for (const turn of turns) {
      if (isEditorFocusedIn(scrapeRoot)) break

      if (!isTurnTextEmpty(turn)) {
        capture(turn)
        done++
        continue
      }

      const hydrated = await hydrateTurn(turn, scrollEl, scrapeRoot)
      if (hydrated) capture(hydrated)
      done++
      opts.onProgress?.(done, turns.length)
    }
  } finally {
    scrollEl.scrollTop = startScrollTop
  }

  return captured
}
