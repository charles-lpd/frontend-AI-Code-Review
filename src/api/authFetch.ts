import { useAuthStore } from '../store/useAuthStore';

/**
 * 滑动续期：后端在剩余有效期不足 7 天时通过 `X-Refreshed-Token` 返回新 token，
 * 每次响应都要检查，存在则替换本地 token。
 */
export function applyRefreshedToken(headers: Headers | Record<string, unknown> | undefined | null) {
  if (!headers) return;
  const value = headers instanceof Headers
    ? headers.get('X-Refreshed-Token')
    : headers['x-refreshed-token'];
  if (typeof value === 'string' && value) {
    useAuthStore.getState().setToken(value);
  }
}

/** GitHub 授权问题（授权失效 / 授权失败）只代表 GitHub 连接不可用，不代表站内登录失效。 */
export function isGithubAuthError(code?: string | null) {
  return code === 'GITHUB_AUTH_EXPIRED' || code === 'GITHUB_AUTH_FAILED';
}

/**
 * 401 处理。只有站内会话失效（SESSION_ACCESS_DENIED 或无法识别的 401）才清除本地登录态并回到首页；
 * GitHub 授权失效由调用方提示用户重新授权，不退出站内登录。
 */
export function handleUnauthorized(code?: string | null) {
  if (isGithubAuthError(code)) return;
  const { logout, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated) return;
  logout();
  if (window.location.pathname !== '/') {
    window.location.href = '/';
  }
}

/** 带鉴权的 fetch：自动附带 Authorization，并处理续期与 401。 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = useAuthStore.getState().token;
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(input, { ...init, headers });
  applyRefreshedToken(response.headers);
  if (response.status === 401) {
    const code = await response.clone().json()
      .then((data) => data?.error?.code as string | undefined)
      .catch(() => undefined);
    handleUnauthorized(code);
  }
  return response;
}
