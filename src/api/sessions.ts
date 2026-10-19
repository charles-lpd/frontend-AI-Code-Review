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
  clearSessionMessages,
  updateSessionManage,
  uploadSessionKnowledge,
  deleteSessionKnowledge,
  listSessionKnowledge,
  getPublicSessionDetail,
  rebuildSessionKnowledge,
  checkSessionKnowledgeConsistency,
  getKnowledgeContent,
  reindexSessionKnowledgeFile,
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
    indexStatus: file.indexStatus ?? 'pending',
    errorMessage: file.errorMessage ?? file.indexError ?? null,
    indexError: file.errorMessage ?? file.indexError ?? null,
  };
}

function normalizeManageConfig(session: any): SessionManageConfig {
  return {
    isPublic: session.manageConfig?.isPublic ?? session.isPublic ?? false,
    systemPrompt:
      session.manageConfig?.systemPrompt ?? session.systemPrompt ?? '',
    chatMode: session.manageConfig?.chatMode ?? session.chatMode ?? 'auto',
    knowledgeReadiness:
      session.manageConfig?.knowledgeReadiness ??
      session.knowledgeReadiness ??
      'empty',
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
    messages: (session.messages || []).map((message: any) => ({
      ...message,
      createdAt: message.createdAt ? new Date(message.createdAt).getTime() : undefined,
      // 历史消息的引用在顶层 citations 字段，统一挂到 metadata 上，和实时流的渲染保持一致。
      metadata: message.citations?.length || message.status === 'truncated'
        ? {
            ...message.metadata,
            ...(message.citations?.length ? { citations: message.citations } : {}),
            ...(message.status === 'truncated' ? { truncated: true } : {}),
          }
        : message.metadata,
    })),
    draft: session.draft || '',
    chatMode: session.chatMode ?? session.manageConfig?.chatMode ?? 'auto',
    manageConfig: normalizeManageConfig(session),
  } as ChatSession;
}

function normalizePublicSession(session: any): PublicSessionInfo {
  return {
    id: session.id,
    title: session.title,
    isPublic: session.isPublic ?? session.manageConfig?.isPublic ?? false,
    chatMode: session.chatMode ?? session.manageConfig?.chatMode ?? 'auto',
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
    return result.map(normalizeKnowledgeFile);
  },

  async getKnowledgeState(id: string) {
    const result = await listSessionKnowledge(id);
    const rawFiles = result;
    return {
      knowledgeFiles: rawFiles.map(normalizeKnowledgeFile),
      knowledgeReadiness: rawFiles[0]?.knowledgeReadiness ?? 'empty',
    } as { knowledgeFiles: SessionKnowledgeFile[]; knowledgeReadiness?: import('../types/chat').KnowledgeReadiness };
  },

  async create(title?: string): Promise<ChatSession> {
    const data = await createSQLSession(title);
    return normalizeSession(data);
  },

  async delete(id: string): Promise<void> {
    return deleteSession(id);
  },

  async clearMessages(id: string): Promise<ChatSession> {
    const session = await clearSessionMessages(id);
    return normalizeSession(session);
  },

  async updateManageConfig(
    id: string,
    payload: {
      title?: string;
      isPublic?: boolean;
      systemPrompt?: string;
      chatMode?: import('../types/chat').ChatMode;
    },
  ): Promise<ChatSession> {
    const session = await updateSessionManage(id, payload);
    return normalizeSession(session);
  },

  async uploadKnowledge(
    id: string,
    files: File[],
  ): Promise<{ knowledgeFiles: SessionKnowledgeFile[]; knowledgeReadiness?: import('../types/chat').KnowledgeReadiness }> {
    const result = await uploadSessionKnowledge(id, files);
    return {
      ...result,
      knowledgeFiles: (result.knowledgeFiles ?? []).map(normalizeKnowledgeFile),
    };
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

  async reindexKnowledgeFile(id: string, fileId: string) {
    return reindexSessionKnowledgeFile(id, fileId);
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
