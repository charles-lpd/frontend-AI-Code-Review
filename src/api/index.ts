import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import type { PublicChatMessage, SessionKnowledgeFile } from '../types/chat';

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

export const baseUrl = 'http://localhost:3000/api';

export const sendChatStream = async (
  sessionId: string,
  messages: any[],
  signal?: AbortSignal,
) => {
  const token = useAuthStore.getState().token;
  const response = await fetch(`${baseUrl}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      sessionId,
      messages,
      autoComment: false,
    }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `请求失败: ${response.status}`);
  }

  return response;
};

export const sendPublicChatStream = async (
  sessionId: string,
  messages: Pick<PublicChatMessage, 'role' | 'content'>[],
  signal?: AbortSignal,
) => {
  const response = await fetch(`${baseUrl}/public/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      messages,
    }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message ||
        errorData.error ||
        `请求失败: ${response.status}`,
    );
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

    const enhancedError = new Error(errorMsg);
    (enhancedError as any).code = backendError?.code;
    (enhancedError as any).status = error.response?.status;

    return Promise.reject(enhancedError);
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
    url: `${baseUrl}/sessions`,
  });
  return result.data;
};

export const createSQLSession = async (
  title?: string,
): Promise<{ id: string; title: string }> => {
  const result = await sendRequest({
    method: 'POST',
    url: `${baseUrl}/sessions`,
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
    url: `${baseUrl}/sessions/${sessionId}${params.toString() ? `?${params.toString()}` : ''}`,
  });
  return result.data;
};

export const deleteSession = async (sessionId: string): Promise<void> => {
  await sendRequest({
    method: 'DELETE',
    url: `${baseUrl}/sessions/${sessionId}`,
  });
};

export const updateSessionManage = async (
  sessionId: string,
  payload: {
    title?: string;
    isPublic?: boolean;
    systemPrompt?: string;
  },
): Promise<any> => {
  const result = await sendRequest({
    method: 'PATCH',
    url: `${baseUrl}/sessions/${sessionId}/manage`,
    data: payload,
  });
  return result.data;
};

export const uploadSessionKnowledge = async (
  sessionId: string,
  files: File[],
): Promise<{ knowledgeFiles: SessionKnowledgeFile[] }> => {
  const token = useAuthStore.getState().token;
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('files', file);
  });

  const response = await fetch(`${baseUrl}/sessions/${sessionId}/knowledge`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message ||
        errorData.error ||
        `请求失败: ${response.status}`,
    );
  }

  return response.json();
};

export const getKnowledgeContent = async (
  sessionId: string,
  fileId: string,
): Promise<KnowledgePreviewResult> => {
  const token = useAuthStore.getState().token;
  const response = await fetch(
    `${baseUrl}/sessions/${sessionId}/knowledge/${fileId}/content`,
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
    url: `${baseUrl}/sessions/${sessionId}/knowledge/${fileId}`,
  });
  return result.data;
};

export const listSessionKnowledge = async (
  sessionId: string,
): Promise<{
  knowledgeFiles: SessionKnowledgeFile[];
}> => {
  const result = await sendRequest({
    method: 'GET',
    url: `${baseUrl}/sessions/${sessionId}/knowledge`,
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
    url: `${baseUrl}/sessions/${sessionId}/knowledge/rebuild`,
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
    url: `${baseUrl}/sessions/${sessionId}/knowledge/consistency`,
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
