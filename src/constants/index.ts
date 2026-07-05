
export const isProd = window.location.host.includes('aqiong.xyz')

export const BACKEND_API_BASE_URL = isProd ? 'https://www.adongdong.xyz/api' : 'http://localhost:3000/api';

export const GITHUB_API_PREFIX = '/github';
export const SESSIONS_API_PREFIX = '/sessions';
export const PUBLIC_SESSION_PATH_PREFIX = '/public/session';

export function buildPublicSessionUrl(origin: string, sessionId: string) {
  return `${origin}${PUBLIC_SESSION_PATH_PREFIX}/${sessionId}`;
}
