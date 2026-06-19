import type {
  ChatSession,
  SessionKnowledgeFile,
  SessionManageConfig,
} from '../types/chat';
import {
  listSessions,
  createSQLSession,
  getSessionDetail,
  deleteSession,
  updateSessionManage,
  uploadSessionKnowledge,
  deleteSessionKnowledge,
} from './index';

function normalizeManageConfig(session: any): SessionManageConfig {
  return {
    isPublic: session.manageConfig?.isPublic ?? session.isPublic ?? false,
    systemPrompt:
      session.manageConfig?.systemPrompt ?? session.systemPrompt ?? '',
    knowledgeFiles: session.manageConfig?.knowledgeFiles ?? [],
  };
}

function normalizeSession(session: any): ChatSession {
  return {
    ...session,
    updatedAt: session.updatedAt
      ? new Date(session.updatedAt).getTime()
      : session.createdAt
        ? new Date(session.createdAt).getTime()
        : Date.now(),
    messages: session.messages || [],
    draft: session.draft || '',
    manageConfig: normalizeManageConfig(session),
  } as ChatSession;
}

export const sessionApi = {
  async list(): Promise<ChatSession[]> {
    const sessions = await listSessions();
    return sessions.map(normalizeSession);
  },

  async get(id: string, limit?: number, cursor?: string): Promise<ChatSession> {
    const session = await getSessionDetail(id, limit, cursor);
    return normalizeSession(session);
  },

  async create(title?: string): Promise<ChatSession> {
    const data = await createSQLSession(title);
    return normalizeSession(data);
  },

  async delete(id: string): Promise<void> {
    return deleteSession(id);
  },

  async updateManageConfig(
    id: string,
    payload: {
      isPublic?: boolean;
      systemPrompt?: string;
    },
  ): Promise<ChatSession> {
    const session = await updateSessionManage(id, payload);
    return normalizeSession(session);
  },

  async uploadKnowledge(
    id: string,
    files: File[],
  ): Promise<SessionKnowledgeFile[]> {
    const result = await uploadSessionKnowledge(id, files);
    return result.knowledgeFiles ?? [];
  },

  async deleteKnowledge(
    id: string,
    fileId: string,
  ): Promise<{ success: boolean }> {
    return deleteSessionKnowledge(id, fileId);
  },
};
