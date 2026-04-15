export type PromptMeta = {
  pinned?: boolean
  note?: string
  updatedAt: number
}

export type ConversationState = {
  prompts: Record<string, PromptMeta>
  updatedAt: number
}

export type PersistedState = {
  conversations: Record<string, ConversationState>
}

export const PROMPT_META_STORAGE_KEY = 'promptMetaState'

const EMPTY_STATE: PersistedState = {
  conversations: {},
}

function cloneState(state: PersistedState): PersistedState {
  return {
    conversations: Object.fromEntries(
      Object.entries(state.conversations).map(
        ([conversationId, conversation]) => [
          conversationId,
          {
            updatedAt: conversation.updatedAt,
            prompts: Object.fromEntries(
              Object.entries(conversation.prompts).map(([turnId, meta]) => [
                turnId,
                { ...meta },
              ]),
            ),
          },
        ],
      ),
    ),
  }
}

function cleanPromptMeta(
  meta: Partial<PromptMeta> | undefined,
): Omit<PromptMeta, 'updatedAt'> | undefined {
  if (!meta) return undefined

  const cleaned: Omit<PromptMeta, 'updatedAt'> = {
    pinned: typeof meta.pinned === 'boolean' ? meta.pinned : undefined,
    note:
      typeof meta.note === 'string' && meta.note.trim().length > 0
        ? meta.note.trim()
        : undefined,
  }

  if (cleaned.pinned === undefined && cleaned.note === undefined) {
    return undefined
  }

  return cleaned
}

function normalizeState(input: unknown): PersistedState {
  if (!input || typeof input !== 'object') {
    return EMPTY_STATE
  }

  const source = input as Partial<PersistedState>
  const conversations = source.conversations

  if (!conversations || typeof conversations !== 'object') {
    return EMPTY_STATE
  }

  const normalized: PersistedState = {
    conversations: {},
  }

  for (const [conversationId, conversationValue] of Object.entries(
    conversations,
  )) {
    if (!conversationValue || typeof conversationValue !== 'object') continue

    const conversation = conversationValue as Partial<ConversationState>
    const prompts = conversation.prompts

    if (!prompts || typeof prompts !== 'object') continue

    const nextPrompts: Record<string, PromptMeta> = {}

    for (const [turnId, metaValue] of Object.entries(prompts)) {
      if (!metaValue || typeof metaValue !== 'object') continue

      const cleaned = cleanPromptMeta(metaValue as Partial<PromptMeta>)
      if (!cleaned) continue

      nextPrompts[turnId] = {
        ...cleaned,
        updatedAt:
          typeof (metaValue as Partial<PromptMeta>).updatedAt === 'number'
            ? (metaValue as Partial<PromptMeta>).updatedAt!
            : Date.now(),
      }
    }

    if (Object.keys(nextPrompts).length === 0) continue

    normalized.conversations[conversationId] = {
      prompts: nextPrompts,
      updatedAt:
        typeof conversation.updatedAt === 'number'
          ? conversation.updatedAt
          : Date.now(),
    }
  }

  return normalized
}

function pruneState(state: PersistedState): PersistedState {
  const next: PersistedState = {
    conversations: {},
  }

  for (const [conversationId, conversation] of Object.entries(
    state.conversations,
  )) {
    const nextPrompts: Record<string, PromptMeta> = {}

    for (const [turnId, meta] of Object.entries(conversation.prompts)) {
      const cleaned = cleanPromptMeta(meta)
      if (!cleaned) continue

      nextPrompts[turnId] = {
        ...cleaned,
        updatedAt:
          typeof meta.updatedAt === 'number' ? meta.updatedAt : Date.now(),
      }
    }

    if (Object.keys(nextPrompts).length === 0) continue

    next.conversations[conversationId] = {
      prompts: nextPrompts,
      updatedAt:
        typeof conversation.updatedAt === 'number'
          ? conversation.updatedAt
          : Date.now(),
    }
  }

  return next
}

export async function loadState(): Promise<PersistedState> {
  const result = await chrome.storage.local.get(PROMPT_META_STORAGE_KEY)
  return normalizeState(result[PROMPT_META_STORAGE_KEY])
}

export async function saveState(
  state: PersistedState,
): Promise<PersistedState> {
  const pruned = pruneState(state)
  await chrome.storage.local.set({
    [PROMPT_META_STORAGE_KEY]: pruned,
  })
  return pruned
}

export async function updatePromptMeta(
  conversationId: string,
  turnId: string,
  updater: (current: PromptMeta | undefined) => Partial<PromptMeta> | undefined,
): Promise<PersistedState> {
  const current = await loadState()
  const next = cloneState(current)

  const existingConversation = next.conversations[conversationId]
  const existingMeta = existingConversation?.prompts[turnId]

  const updatedPartial = updater(existingMeta)
  const cleaned = cleanPromptMeta(updatedPartial)

  if (!cleaned) {
    if (existingConversation) {
      delete existingConversation.prompts[turnId]

      if (Object.keys(existingConversation.prompts).length === 0) {
        delete next.conversations[conversationId]
      } else {
        existingConversation.updatedAt = Date.now()
      }
    }

    return saveState(next)
  }

  const conversation =
    next.conversations[conversationId] ??
    (next.conversations[conversationId] = {
      prompts: {},
      updatedAt: Date.now(),
    })

  conversation.prompts[turnId] = {
    ...cleaned,
    updatedAt: Date.now(),
  }
  conversation.updatedAt = Date.now()

  return saveState(next)
}

export async function togglePinned(
  conversationId: string,
  turnId: string,
): Promise<PersistedState> {
  return updatePromptMeta(conversationId, turnId, (current) => {
    const nextPinned = !current?.pinned
    const nextNote = current?.note

    if (!nextPinned && !nextNote) {
      return undefined
    }

    return {
      pinned: nextPinned,
      note: nextNote,
    }
  })
}

export function getPromptMeta(
  state: PersistedState | undefined,
  conversationId?: string,
  turnId?: string,
): PromptMeta | undefined {
  if (!state || !conversationId || !turnId) return undefined
  return state.conversations[conversationId]?.prompts[turnId]
}
