import { useEffect } from 'react';
// import { useLocation, useNavigate } from 'react-router-dom';
import { BACKEND_API_BASE_URL } from '../constants';
import { useAuthStore } from '../store/useAuthStore';

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

  const login = () => {
    window.location.href = `${BACKEND_API_BASE_URL}/github/auth/login`;
  };

  return { isAuthenticated, user, login, logout };
};
