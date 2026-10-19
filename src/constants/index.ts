
export const isProd = window.location.host.includes('aqiong.xyz') || window.location.host.includes('4everland.app')

const configuredApiOrigin = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '');

export const BACKEND_API_BASE_URL = configuredApiOrigin
  ? configuredApiOrigin.endsWith('/api')
    ? configuredApiOrigin
    : `${configuredApiOrigin}/api`
  : isProd
    ? 'https://www.adongdong.xyz/api'
    : 'http://localhost:3000/api';

export const CHAT_API_PATH = '/chat';
export const PUBLIC_CHAT_API_PATH = '/public/chat';
export const GITHUB_API_PREFIX = '/github';
/** GitHub App 安装页地址，例如 https://github.com/apps/<app-slug>/installations/new，由环境变量配置 */
export const GITHUB_APP_INSTALL_URL: string = import.meta.env.VITE_GITHUB_APP_INSTALL_URL ?? '';
export const SESSIONS_API_PREFIX = '/sessions';
export const PUBLIC_SESSION_PATH_PREFIX = '/public/session';

export function buildPublicSessionUrl(origin: string, sessionId: string) {
  return `${origin}${PUBLIC_SESSION_PATH_PREFIX}/${sessionId}`;
}
