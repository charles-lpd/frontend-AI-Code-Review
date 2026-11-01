import { SESSIONS_API_PREFIX } from '../constants';
import { baseUrl, sendRequest } from './index';

/** 长期记忆条目（文档 5.4 节） */
export interface MemoryItem {
  id: string;
  text: string;
  createdAt: string;
}

export interface MemoryListResponse {
  items: MemoryItem[];
  limit: number;
  offset: number;
  /** 不为 null 时，作为下一次请求的 offset */
  nextOffset: number | null;
  maxItems: number;
}

const memoriesUrl = (sessionId: string) => `${baseUrl}${SESSIONS_API_PREFIX}/${sessionId}/memories`;

/** 列出会话记忆（仅会话拥有者） */
export async function listMemories(
  sessionId: string,
  { limit = 20, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<MemoryListResponse> {
  const result = await sendRequest({
    method: 'GET',
    url: memoriesUrl(sessionId),
    params: { limit, offset },
  });
  return result.data;
}

/** 删除一条记忆 */
export async function deleteMemory(sessionId: string, memoryId: string): Promise<{ success: boolean }> {
  const result = await sendRequest({
    method: 'DELETE',
    url: `${memoriesUrl(sessionId)}/${memoryId}`,
  });
  return result.data;
}

/** 清空会话的全部记忆 */
export async function clearMemories(sessionId: string): Promise<{ success: boolean; deleted: number }> {
  const result = await sendRequest({
    method: 'DELETE',
    url: memoriesUrl(sessionId),
  });
  return result.data;
}
