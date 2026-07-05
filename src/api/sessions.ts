import type {
  ChatSession,
  PublicSessionInfo,
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
  listSessionKnowledge,
  getPublicSessionDetail,
  rebuildSessionKnowledge,
  checkSessionKnowledgeConsistency,
  getKnowledgeContent,
} from './index';

function normalizeKnowledgeFile(file: any): SessionKnowledgeFile {
  return {
    id: file.id,
    name: file.name,
    size: file.size,
    type: file.type,
    uploadedAt: file.uploadedAt
      ? new Date(file.uploadedAt).getTime()
      : file.createdAt
        ? new Date(file.createdAt).getTime()
        : Date.now(),
    indexStatus: file.indexStatus ?? 'ready',
    indexError: file.indexError ?? null,
  };
}

function normalizeManageConfig(session: any): SessionManageConfig {
  return {
    isPublic: session.manageConfig?.isPublic ?? session.isPublic ?? false,
    systemPrompt:
      session.manageConfig?.systemPrompt ?? session.systemPrompt ?? '',
    knowledgeFiles: (session.manageConfig?.knowledgeFiles ?? []).map(
      normalizeKnowledgeFile,
    ),
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

function normalizePublicSession(session: any): PublicSessionInfo {
  return {
    id: session.id,
    title: session.title,
    isPublic: session.isPublic ?? session.manageConfig?.isPublic ?? false,
    createdAt: session.createdAt
      ? new Date(session.createdAt).getTime()
      : Date.now(),
    warning: session.warning ?? null,
    manageConfig: normalizeManageConfig(session),
  };
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

  async listKnowledgeFiles(id: string): Promise<SessionKnowledgeFile[]> {
    const result = await listSessionKnowledge(id);
    const knowledgeFiles = Array.isArray(result)
      ? result
      : result?.knowledgeFiles ?? [];
    return knowledgeFiles.map(normalizeKnowledgeFile);
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
      title?: string;
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

  async rebuildKnowledge(id: string): Promise<{ success: boolean }> {
    return rebuildSessionKnowledge(id);
  },

  async checkKnowledgeConsistency(
    id: string,
  ): Promise<{ ok: boolean; issues?: string[] }> {
    return checkSessionKnowledgeConsistency(id);
  },

  async getKnowledgeContent(id: string, fileId: string) {
    return getKnowledgeContent(id, fileId);
  },

  async getPublicDetail(id: string): Promise<PublicSessionInfo> {
    const session = await getPublicSessionDetail(id);
    return normalizePublicSession(session);
  },
};
