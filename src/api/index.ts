import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import {
  BACKEND_API_BASE_URL,
  CHAT_API_PATH,
  PUBLIC_CHAT_API_PATH,
  SESSIONS_API_PREFIX,
} from '../constants';
import { useAuthStore } from '../store/useAuthStore';
import type { ApiErrorCode, PublicChatMessage, SessionKnowledgeFile } from '../types/chat';

export class ApiError extends Error {
  constructor(
    message: string,
    public code: ApiErrorCode = 'INTERNAL_ERROR',
    public requestId?: string,
    public retryable = false,
    public status?: number,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function throwResponseError(response: Response): Promise<never> {
  const data = await response.json().catch(() => ({}));
  const detail = data?.error;
  const retryAfterHeader = response.headers.get('Retry-After');
  const retryAfter = retryAfterHeader === null ? undefined : Number(retryAfterHeader);
  throw new ApiError(
    detail?.message || (typeof detail === 'string' ? detail : `请求失败: ${response.status}`),
    detail?.code,
    detail?.requestId,
    detail?.retryable,
    response.status,
    Number.isFinite(retryAfter) ? retryAfter : undefined,
  );
}

export type KnowledgePreviewResult =
  | {
      kind: 'markdown' | 'text';
      contentType: string;
      text: string;
    }
  | {
      kind: 'pdf';
      contentType: string;
      blobUrl: string;
    };

const validateStatus = function (status: number): boolean {
  return status >= 200 && status < 300;
};

export const baseUrl = BACKEND_API_BASE_URL;

export const sendChatStream = async (
  sessionId: string,
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
  }>,
  signal?: AbortSignal,
  clientMessageId?: string,
) => {
  const token = useAuthStore.getState().token;
  const response = await fetch(`${baseUrl}${CHAT_API_PATH}`, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      sessionId,
      ...(clientMessageId ? { clientMessageId } : {}),
      messages,
    }),
    signal,
  });

  if (!response.ok) {
    await throwResponseError(response);
  }

  return response;
};

export const sendPublicChatStream = async (
  sessionId: string,
  messages: Pick<PublicChatMessage, 'role' | 'content'>[],
  signal?: AbortSignal,
) => {
  const response = await fetch(`${baseUrl}${PUBLIC_CHAT_API_PATH}`, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      messages,
    }),
    signal,
  });

  if (!response.ok) {
    await throwResponseError(response);
  }

  return response;
};

const api = axios.create({
  baseURL: baseUrl,
  timeout: 15000,
  validateStatus,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const backendError = error.response?.data?.error;
    const errorMsg = backendError?.message || error.message || '未知系统错误';

    if (error.response?.status === 401) {
      const { logout, isAuthenticated } = useAuthStore.getState();
      if (isAuthenticated) {
        logout();
        if (window.location.pathname !== '/') {
          window.location.href = '/';
        }
      }
    }

    return Promise.reject(new ApiError(
      errorMsg,
      backendError?.code,
      backendError?.requestId,
      backendError?.retryable,
      error.response?.status,
      Number.isFinite(Number(error.response?.headers?.['retry-after']))
        ? Number(error.response?.headers?.['retry-after'])
        : undefined,
    ));
  },
);

export const sendRequest = async (
  config: AxiosRequestConfig,
): Promise<AxiosResponse> => {
  return await api(config);
};

export const listSessions = async (): Promise<any[]> => {
  const result = await sendRequest({
    method: 'GET',
    url: `${baseUrl}${SESSIONS_API_PREFIX}`,
  });
  return result.data;
};

export const createSQLSession = async (
  title?: string,
): Promise<{ id: string; title: string }> => {
  const result = await sendRequest({
    method: 'POST',
    url: `${baseUrl}${SESSIONS_API_PREFIX}`,
    data: {
      title,
    },
  });
  return result.data;
};

export const getSessionDetail = async (
  sessionId: string,
  limit?: number,
  cursor?: string,
): Promise<any> => {
  const params = new URLSearchParams();
  if (limit) params.append('limit', limit.toString());
  if (cursor) params.append('cursor', cursor);

  const result = await sendRequest({
    method: 'GET',
    url: `${baseUrl}${SESSIONS_API_PREFIX}/${sessionId}${params.toString() ? `?${params.toString()}` : ''}`,
  });
  return result.data;
};

export const deleteSession = async (sessionId: string): Promise<void> => {
  await sendRequest({
    method: 'DELETE',
    url: `${baseUrl}${SESSIONS_API_PREFIX}/${sessionId}`,
  });
};

export const clearSessionMessages = async (
  sessionId: string,
): Promise<any> => {
  const result = await sendRequest({
    method: 'POST',
    url: `${baseUrl}${SESSIONS_API_PREFIX}/${sessionId}/clear`,
  });
  return result.data;
};

export const updateSessionManage = async (
  sessionId: string,
  payload: {
    title?: string;
    isPublic?: boolean;
    systemPrompt?: string;
    chatMode?: import('../types/chat').ChatMode;
  },
): Promise<any> => {
  const result = await sendRequest({
    method: 'PATCH',
    url: `${baseUrl}${SESSIONS_API_PREFIX}/${sessionId}/manage`,
    data: payload,
  });
  return result.data;
};

export const uploadSessionKnowledge = async (
  sessionId: string,
  files: File[],
): Promise<{ knowledgeFiles: SessionKnowledgeFile[]; knowledgeReadiness?: import('../types/chat').KnowledgeReadiness }> => {
  const token = useAuthStore.getState().token;
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('files', file);
  });

  const response = await fetch(`${baseUrl}${SESSIONS_API_PREFIX}/${sessionId}/knowledge`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  if (!response.ok) {
    await throwResponseError(response);
  }

  return response.json();
};

export const getKnowledgeContent = async (
  sessionId: string,
  fileId: string,
): Promise<KnowledgePreviewResult> => {
  const token = useAuthStore.getState().token;
  const response = await fetch(
    `${baseUrl}${SESSIONS_API_PREFIX}/${sessionId}/knowledge/${fileId}/content`,
    {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(
      errorData.error?.message ||
        errorData.error ||
        `请求失败: ${response.status}`,
    );
    (error as any).status = response.status;
    throw error;
  }

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('text/markdown')) {
    return {
      kind: 'markdown',
      contentType,
      text: await response.text(),
    };
  }

  if (contentType.includes('text/plain')) {
    return {
      kind: 'text',
      contentType,
      text: await response.text(),
    };
  }

  if (contentType.includes('application/pdf')) {
    const blob = await response.blob();
    return {
      kind: 'pdf',
      contentType,
      blobUrl: URL.createObjectURL(blob),
    };
  }

  throw new Error('当前文件类型暂不支持在线预览');
};

export const deleteSessionKnowledge = async (
  sessionId: string,
  fileId: string,
): Promise<{ success: boolean }> => {
  const result = await sendRequest({
    method: 'DELETE',
    url: `${baseUrl}${SESSIONS_API_PREFIX}/${sessionId}/knowledge/${fileId}`,
  });
  return result.data;
};

export const listSessionKnowledge = async (
  sessionId: string,
): Promise<Array<SessionKnowledgeFile & {
  knowledgeReadiness: import('../types/chat').KnowledgeReadiness;
}>> => {
  const result = await sendRequest({
    method: 'GET',
    url: `${baseUrl}${SESSIONS_API_PREFIX}/${sessionId}/knowledge`,
  });
  return result.data;
};

export const rebuildSessionKnowledge = async (
  sessionId: string,
): Promise<{
  success: boolean;
}> => {
  const result = await sendRequest({
    method: 'POST',
    url: `${baseUrl}${SESSIONS_API_PREFIX}/${sessionId}/knowledge/rebuild`,
  });
  return result.data;
};

export const reindexSessionKnowledgeFile = async (sessionId: string, fileId: string): Promise<{
  success: boolean; fileId: string; jobId: string; deduplicated: boolean; indexStatus: 'pending';
}> => {
  const result = await sendRequest({
    method: 'POST',
    url: `${baseUrl}${SESSIONS_API_PREFIX}/${sessionId}/knowledge/${fileId}/reindex`,
  });
  return result.data;
};

export const checkSessionKnowledgeConsistency = async (
  sessionId: string,
): Promise<{
  ok: boolean;
  issues?: string[];
}> => {
  const result = await sendRequest({
    method: 'GET',
    url: `${baseUrl}${SESSIONS_API_PREFIX}/${sessionId}/knowledge/consistency`,
  });
  return result.data;
};

export const getPublicSessionDetail = async (
  sessionId: string,
): Promise<any> => {
  const result = await sendRequest({
    method: 'GET',
    url: `${baseUrl}/public/sessions/${sessionId}`,
  });
  return result.data;
};
