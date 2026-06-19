import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import type { SessionKnowledgeFile } from '../types/chat';

const validateStatus = function (status: number): boolean {
  return status >= 200 && status < 300;
};

export const baseUrl = 'https://www.adongdong.xyz/api';

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
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('files', file);
  });

  const result = await sendRequest({
    method: 'POST',
    url: `${baseUrl}/sessions/${sessionId}/knowledge`,
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return result.data;
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
