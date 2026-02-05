import { SEL } from './selectors'

export type PageKind = 'chat' | 'projects' | 'unknown'

export function getHeader(doc: Document = document): HTMLElement | null {
  return doc.querySelector<HTMLElement>(SEL.header)
}

export function getMain(doc: Document = document): HTMLElement | null {
  return doc.querySelector<HTMLElement>(SEL.main)
}

export function getThreadCandidates(doc: Document = document): HTMLElement[] {
  return Array.from(doc.querySelectorAll<HTMLElement>(SEL.threadRoots))
}

/** Thread-like root (may exist even with zero turns, e.g. "new chat"). */
export function getThreadLikeRoot(
  doc: Document = document,
): HTMLElement | null {
  return getThreadCandidates(doc)[0] ?? null
}

/**
 * Active chat thread = a thread root that contains turns.
 * (New chat / landing pages may have a thread root with no turns yet.)
 */
export function getActiveThread(doc: Document = document): HTMLElement | null {
  const candidates = getThreadCandidates(doc)
  if (!candidates.length) return null

  const withTurns = candidates.filter((el) => el.querySelector(SEL.turn))
  if (!withTurns.length) return null

  return withTurns.find((el) => el.querySelector(SEL.userTurn)) ?? withTurns[0]
}

export function pageKind(doc: Document = document): PageKind {
  const threadLike = getThreadLikeRoot(doc)
  if (!threadLike) return 'unknown'

  const hasTurns = !!threadLike.querySelector(SEL.turn)
  const hasProjectMarkers = !!threadLike.querySelector(SEL.projectsIndexMarkers)

  if (hasProjectMarkers && !hasTurns) return 'projects'
  return 'chat'
}

export function shouldShowSidebar(doc: Document = document): boolean {
  return pageKind(doc) === 'chat'
}
