import type { ChatSession } from '../types/chat';
import {
  listSessions,
  createSQLSession,
  getSessionDetail,
  deleteSession,
} from './index';

export const sessionApi = {
  /** 获取所有会话列表 */
  async list(): Promise<ChatSession[]> {
    return listSessions();
  },

  /** 获取特定会话详情（支持分页消息） */
  async get(id: string, limit?: number, cursor?: string): Promise<ChatSession> {
    return getSessionDetail(id, limit, cursor);
  },

  /** 创建新会话 */
  async create(title?: string): Promise<ChatSession> {
    const data = await createSQLSession(title);
    return {
      ...data,
      messages: [],
      draft: '',
      updatedAt: Date.now(),
    } as ChatSession;
  },

  /** 删除会话 */
  async delete(id: string): Promise<void> {
    return deleteSession(id);
  },
};
