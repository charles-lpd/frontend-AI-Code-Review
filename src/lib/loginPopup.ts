import { useAuthStore } from '../store/useAuthStore';

/** 授权回调页通知登录弹窗（opener）的消息类型 */
export const AUTH_MESSAGE_TYPE = 'everpay:github-auth';

/** 登录弹窗的 window.name（仅作参考，跨源跳转后可能丢失，不能作为判断依据） */
export const LOGIN_POPUP_NAME = 'github-oauth-login';

/** 后端 GitHub 登录回调重定向的专用路径：${FRONTEND_URL}/login-callback?token=<JWT> */
export const LOGIN_CALLBACK_PATH = '/login-callback';

function openerExists() {
  return !!window.opener && window.opener !== window;
}

/**
 * 在应用渲染前调用，处理 GitHub 登录回调（/login-callback?token=...）。
 *
 * 跨源跳转（GitHub → 本站）后，浏览器可能切断 window.opener 和 window.name（COOP），
 * 无法可靠判断自己是否为登录弹窗，所以这里不再根据身份决定跳转：
 * 保存 token → 尽力通知主页面 → 尝试关闭窗口。
 * 主页面通过轮询 localStorage 关闭登录对话框，不依赖这里的通知是否送达。
 *
 * 返回 true 表示已接管，调用方不渲染应用，因此不会跳到首页。
 */
export function handleLoginCallback(): boolean {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token');
  if (!token || url.pathname !== LOGIN_CALLBACK_PATH) return false;

  useAuthStore.getState().setToken(token);

  if (openerExists()) {
    try {
      window.opener.postMessage({ type: AUTH_MESSAGE_TYPE, token }, window.location.origin);
    } catch {
      // opener 不可用时忽略，主页面会通过 localStorage 轮询拿到 token
    }
  }
  window.close();
  return true;
}
