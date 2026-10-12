
export const isProd = window.location.host.includes('aqiong.xyz') || window.location.host.includes('4everland.app')

export const BACKEND_API_BASE_URL = isProd ? 'https://www.adongdong.xyz/api' : 'http://localhost:3000/api';

export const CHAT_API_PATH = '/chat';
export const PUBLIC_CHAT_API_PATH = '/public/chat';
export const CODE_REVIEW_API_PATH = '/code-review';
export const AGENT_API_PATH = '/agent';
export const IMAGE_GENERATION_API_PATH = '/image';
export const VIDEO_GENERATION_API_PATH = '/video';
export const GITHUB_API_PREFIX = '/github';
export const SESSIONS_API_PREFIX = '/sessions';
export const PUBLIC_SESSION_PATH_PREFIX = '/public/session';

export function buildPublicSessionUrl(origin: string, sessionId: string) {
  return `${origin}${PUBLIC_SESSION_PATH_PREFIX}/${sessionId}`;
}
