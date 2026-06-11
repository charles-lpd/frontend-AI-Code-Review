import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import isObject from 'lodash/isObject';
import isString from 'lodash/isString';
import { useAuthStore } from '../store/useAuthStore';

// `validateStatus` defines whether to resolve or reject the promise for a given
// HTTP response status code. If `validateStatus` returns `true` (or is set to `null`
// or `undefined`), the promise will be resolved; otherwise, the promise will be rejected.
const validateStatus = function (status: number): boolean {
  return status >= 200 && status < 300; // default
};

export const baseUrl = 'https://www.adongdong.xyz/api';

/** 专门用于处理 AI 聊天的流式请求 */
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

// 创建 axios 实例
const api = axios.create({
  baseURL: baseUrl,
  timeout: 15000,
  validateStatus,
});

// 请求拦截器：注入 Token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：处理 401 及统一错误格式
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 优先尝试获取后端统一定义的错误消息
    const backendError = error.response?.data?.error;
    const errorMsg = backendError?.message || error.message || '未知系统错误';

    if (error.response?.status === 401) {
      const { logout, isAuthenticated } = useAuthStore.getState();

      // 只有当之前是登录状态时才执行登出和跳转，避免重复触发
      if (isAuthenticated) {
        logout();
        // 如果不是在首页，则跳转到首页
        if (window.location.pathname !== '/') {
          window.location.href = '/';
        }
      }
    }

    // 将格式化后的错误信息重新包装，方便上层使用
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
