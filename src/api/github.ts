import axios from 'axios';
import { BACKEND_API_BASE_URL, GITHUB_API_PREFIX } from '../constants';
import { useAuthStore } from '../store/useAuthStore';
import { applyRefreshedToken, handleUnauthorized } from '../api/authFetch';

const baseUrl = `${BACKEND_API_BASE_URL}${GITHUB_API_PREFIX}`;

const api = axios.create({
  baseURL: baseUrl,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：处理滑动续期、统一错误格式与 401
api.interceptors.response.use(
  (response) => {
    applyRefreshedToken(response.headers);
    return response;
  },
  (error) => {
    applyRefreshedToken(error.response?.headers);
    const backendError = error.response?.data?.error;
    const errorMsg =
      backendError?.message || error.message || 'GitHub 服务异常';

    if (error.response?.status === 401) {
      handleUnauthorized(backendError?.code);
    }

    const enhancedError = new Error(errorMsg);
    (enhancedError as any).status = error.response?.status;
    (enhancedError as any).code = backendError?.code;
    (enhancedError as any).retryable = backendError?.retryable ?? false;
    return Promise.reject(enhancedError);
  },
);

export interface GithubRepo {
  id: number;
  name: string;
  fullName: string;
  isPrivate: boolean;
  description: string;
  updatedAt: string;
  defaultBranch: string;
}

export const githubApi = {
  /** 当前用户信息：githubId / login / name / avatarUrl */
  getUserInfo: async () => {
    const res = await api.get('/user/info');
    return res.data;
  },

  /** 最近更新的 50 个仓库（后端不分页） */
  getUserRepos: async () => {
    const res = await api.get('/user/repos');
    return res.data as GithubRepo[];
  },
};
