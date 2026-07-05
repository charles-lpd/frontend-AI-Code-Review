import axios from 'axios';
import { BACKEND_API_BASE_URL, GITHUB_API_PREFIX } from '../constants';
import { useAuthStore } from '../store/useAuthStore';

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

// 响应拦截器：处理统一错误格式
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const backendError = error.response?.data?.error;
    const errorMsg =
      backendError?.message || error.message || 'GitHub 服务异常';

    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }

    const enhancedError = new Error(errorMsg);
    (enhancedError as any).status = error.response?.status;
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
  exchangeCodeForToken: async (code: string) => {
    // 这里调用后端的 callback 接口，假设它支持返回 JSON 或者我们直接处理重定向后的 token
    // 根据用户描述，我们需要将 code 提交到后端
    const res = await api.get('/auth/callback', {
      params: { code },
      // 禁止自动重定向，以便我们手动获取重定向 URL 中的 token（如果是浏览器环境 fetch/axios 会自动处理重定向）
      // 但如果后端重定向回前端，fetch 最终会返回前端页面的内容。
      // 最好的方式是后端提供一个直接返回 token 的接口，或者前端从重定向后的 URL 中提取。
    });
    return res.data;
  },

  getUserInfo: async () => {
    const res = await api.get('/user/info');
    return res.data;
  },

  getUserRepos: async (page = 1, perPage = 30) => {
    const res = await api.get('/user/repos', {
      params: { page, per_page: perPage },
    });
    return res.data as GithubRepo[];
  },
};
