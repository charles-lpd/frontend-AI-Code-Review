import type { ChatMessage, ChatSession } from '../types/chat'

/** 根据首条用户消息生成会话标题 */
export function deriveSessionTitle(
  messages: ChatMessage[],
  fallback: string,
): string {
  const firstUser = messages.find((m) => m.role === 'user')
  if (!firstUser) return fallback
  const text = firstUser.content.trim()
  if (!text) return fallback
  return text.length > 24 ? `${text.slice(0, 24)}…` : text
}

export function createEmptySession(index: number): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: `新对话 ${index}`,
    messages: [],
    draft: '',
    updatedAt: Date.now(),
  }
}

export function findSession(
  sessions: ChatSession[],
  id: string,
): ChatSession | undefined {
  return sessions.find((s) => s.id === id)
}

export function patchSession(
  sessions: ChatSession[],
  id: string,
  patch: Partial<ChatSession>,
): ChatSession[] {
  return sessions.map((s) =>
    s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s,
  )
}
