import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { baseUrl } from '../api/index';

export const useAuth = () => {
  const { setToken, fetchUserInfo, isAuthenticated, logout, user } =
    useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

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

  const login = () => {
    window.location.href = `${baseUrl}/github/auth/login`;
  };

  return { isAuthenticated, user, login, logout };
};
