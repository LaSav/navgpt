import { uid } from '../util/id'

export type PromptItem = {
  id: string
  text: string
  el: HTMLElement
  edits: number
  totalVersions: number
  currentVersion: number
  isEditing: boolean
  hasCode: boolean
  codeLang?: string
}

/** Single-line summary or generous preview (clamped by CSS in sidebar). */
function summarize(text: string, max = 2000): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? oneLine.slice(0, max - 1) + '…' : oneLine
}

function parseRevisionInfo(article: HTMLElement | null) {
  let current = 1,
    total = 1
  if (article) {
    const counter =
      article.querySelector<HTMLElement>('.tabular-nums') ||
      article.querySelector<HTMLElement>('[class*="tabular-nums"]')
    const txt = counter?.textContent?.trim() ?? ''
    const m = txt.match(/(\d+)\s*\/\s*(\d+)/)
    if (m) {
      current = parseInt(m[1], 10)
      total = parseInt(m[2], 10)
    } else {
      const hasPrev = !!article.querySelector(
        '[aria-label="Previous response"]'
      )
      const hasNext = !!article.querySelector('[aria-label="Next response"]')
      if (hasPrev || hasNext) total = 2
    }
  }
  return {
    currentVersion: current,
    totalVersions: total,
    edits: Math.max(0, total - 1),
  }
}

/** Pull a language hint from code element attributes/classes */
function inferLangFrom(el: Element): string | undefined {
  const tryVals = [
    el.getAttribute('data-language'),
    el.getAttribute('data-lang'),
    el.getAttribute('lang'),
    el.getAttribute('aria-label'),
    el.className,
  ].filter(Boolean) as string[]

  for (const v of tryVals) {
    // language-javascript, lang-js, language-tsx, etc
    const m = v.match(/\b(language|lang)[-:_ ]?([\w+.-]+)\b/i)
    if (m && m[2]) return m[2].toLowerCase()
    // highlight.js style classes like "hljs javascript"
    const m2 = v.match(
      /\b(js|javascript|jsx|ts|tsx|python|py|java|kotlin|c\+\+|cpp|csharp|cs|go|rust|rb|ruby|php|bash|sh|zsh|shell|sql|json|yaml|toml)\b/i
    )
    if (m2 && m2[0]) return m2[0].toLowerCase()
  }
  return undefined
}

/** Strong DOM-first detection; fallback to backticks in raw text */
function detectCodeInArticle(article: HTMLElement, rawText: string) {
  // Prefer real code blocks anywhere in the user turn
  const preCodes = Array.from(article.querySelectorAll('pre code'))
  if (preCodes.length) {
    const lang =
      inferLangFrom(preCodes[0]) ||
      (preCodes[0].parentElement
        ? inferLangFrom(preCodes[0].parentElement!)
        : undefined)
    return { hasCode: true, codeLang: lang }
  }

  // Any inline code?
  const inlineCode = article.querySelector('code')
  if (inlineCode) {
    return { hasCode: true, codeLang: inferLangFrom(inlineCode) }
  }

  // Raw backticks (e.g., while editing/drafts or if rendering hasn’t happened yet)
  if (/```/.test(rawText)) {
    const m = rawText.match(/```([\w+.-]*)/)
    const lang = m && m[1] ? m[1].toLowerCase() || undefined : undefined
    return { hasCode: true, codeLang: lang }
  }

  return { hasCode: false, codeLang: undefined }
}

export function scrapePrompts(root: ParentNode = document): PromptItem[] {
  const articles = Array.from(
    root.querySelectorAll<HTMLElement>('article[data-turn="user"]')
  )

  return articles.map((article) => {
    // Stable ID based on data-turn-id; fallback to a persistent data attribute
    const turnId = article.getAttribute('data-turn-id') || ''
    const id = turnId || (article.dataset.promptId ||= uid('prompt'))
    if (!article.dataset.promptId) article.dataset.promptId = id

    const textarea = article.querySelector<HTMLTextAreaElement>('textarea')
    const isEditing = !!textarea

    let scrollTarget: HTMLElement = article
    let text = ''

    if (isEditing) {
      text = textarea!.value
      scrollTarget = article // bubble is absent during edit
    } else {
      const bubble = article.querySelector<HTMLElement>(
        '[data-message-author-role="user"]'
      )
      text = bubble?.textContent || bubble?.innerText || ''
      if (bubble) scrollTarget = bubble // precise aim when not editing
    }

    const { currentVersion, totalVersions, edits } = parseRevisionInfo(article)
    const short = summarize(text, 2000)

    // Detect code using the full article DOM (more reliable than bubble text)
    const { hasCode, codeLang } = detectCodeInArticle(article, text)

    return {
      id,
      text: short,
      el: scrollTarget,
      edits,
      totalVersions,
      currentVersion,
      isEditing,
      hasCode,
      codeLang,
    }
  })
}

// --- NEW: Stricter relevance detection ----------------------------

function isRelevantMutationBatch(mutations: MutationRecord[]): boolean {
  return mutations.some(isRelevantMutation)
}

function isRelevantMutation(m: MutationRecord): boolean {
  if (m.type === 'childList') {
    const nodes = [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)]

    // Case 1: a user article itself was added/removed
    if (
      nodes.some(
        (n) =>
          n instanceof HTMLElement &&
          (n.matches('article[data-turn="user"]') ||
            !!n.querySelector?.('article[data-turn="user"]'))
      )
    ) {
      return true
    }

    // Case 2: children changed *within* a user article – e.g. edit mode toggled
    const targetEl = m.target as HTMLElement
    const userArticle = targetEl.closest(
      'article[data-turn="user"]'
    ) as HTMLElement | null

    if (userArticle) {
      // If we added/removed a textarea or editor-like element, we care.
      if (
        nodes.some(
          (n) =>
            n instanceof HTMLElement &&
            (n.matches('textarea, [contenteditable="true"], form') ||
              !!n.querySelector?.('textarea, [contenteditable="true"]'))
        )
      ) {
        return true
      }
    }

    return false
  }

  if (m.type === 'attributes') {
    const el = m.target as HTMLElement
    if (!el) return false

    const userArticle = el.closest(
      'article[data-turn="user"]'
    ) as HTMLElement | null
    if (!userArticle) return false

    // Only treat attribute changes on the article itself (or revision UI)
    // as relevant.
    if (el === userArticle) return true

    if (
      el.classList.contains('tabular-nums') ||
      el.getAttribute('aria-label') === 'Previous response' ||
      el.getAttribute('aria-label') === 'Next response'
    ) {
      return true
    }

    return false
  }

  return false
}

/** Observe DOM changes and rescrape when messages appear/disappear. */
export function observePrompts(
  onUpdate: (items: PromptItem[]) => void,
  root: ParentNode = document
) {
  let lastSignature: string | null = null

  const emit = () => {
    const items = scrapePrompts()

    const signature = items
      .map(
        (i) =>
          `${i.id}|${i.edits}|${i.currentVersion}|${i.totalVersions}|${i.text}`
      )
      .join('||')

    if (signature === lastSignature) return
    lastSignature = signature

    console.log('[scrapePrompts] rescrape triggered')
    console.log('[scrapePrompts] items:', items)
    onUpdate(items)
  }

  const settle = (fn: () => void) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => requestAnimationFrame(fn))
    )

  let scheduled = false
  const schedule = () => {
    if (scheduled) return
    scheduled = true
    settle(() => {
      scheduled = false
      emit()
    })
  }

  const observerTarget =
    root instanceof Document
      ? root.body || document.body
      : (root as Element | DocumentFragment)

  const mo = new MutationObserver((mutations) => {
    const relevant = isRelevantMutationBatch(mutations)
    if (relevant) schedule()
  })

  mo.observe(observerTarget, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-state', 'data-writing-block'],
    characterData: false,
  })

  settle(emit)
  return () => mo.disconnect()
}
