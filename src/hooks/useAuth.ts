import { useEffect } from 'react';
// import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { useLoginDialogStore } from '../store/useLoginDialogStore';

export const useAuth = () => {
  const { setToken, fetchUserInfo, isAuthenticated, logout, user } =
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

  return { isAuthenticated, user, login, logout };
};
