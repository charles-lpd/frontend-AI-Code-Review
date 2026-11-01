import { useEffect } from 'react';
// import { useLocation, useNavigate } from 'react-router-dom';
import { BACKEND_API_BASE_URL } from '../constants';
import { useAuthStore } from '../store/useAuthStore';
import { useLoginDialogStore } from '../store/useLoginDialogStore';

export const useAuth = () => {
  const { setToken, fetchUserInfo, isAuthenticated, user } =
    useAuthStore();
  // const location = useLocation();
  // const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token) {
      setToken(token);
      // 清除 URL 中的 token，但不触发 location 变化导致的重复执行
      const url = new URL(window.location.href);
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.toString());

      fetchUserInfo();
    }
  }, [setToken, fetchUserInfo]);

  useEffect(() => {
    if (isAuthenticated && !user) {
      fetchUserInfo();
    }
  }, [isAuthenticated, user, fetchUserInfo]);

  /** 打开登录弹窗（真正的 GitHub 授权在弹窗内的授权窗口中进行） */
  const login = () => {
    useLoginDialogStore.getState().setOpen(true);
  };

  /**
   * 退出登录：先通知后端使该用户已签发的 token 全部失效，再清除本地 token。
   * 后端请求失败（网络问题、token 已失效）也必须清除本地登录态。
   */
  const logout = async () => {
    const { token, logout: clearLocalSession } = useAuthStore.getState();
    if (token) {
      try {
        await fetch(`${BACKEND_API_BASE_URL}/github/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (error) {
        console.error('Failed to call logout endpoint:', error);
      }
    }
    clearLocalSession();
  };

  return { isAuthenticated, user, login, logout };
};
