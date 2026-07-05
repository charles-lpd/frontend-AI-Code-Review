import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { BACKEND_API_BASE_URL } from '../constants';

interface UserInfo {
  githubId: string;
  login: string;
  name: string;
  avatarUrl: string;
}

interface AuthState {
  token: string | null;
  user: UserInfo | null;
  isAuthenticated: boolean;

  // Actions
  setToken: (token: string) => void;
  setUser: (user: UserInfo | null) => void;
  logout: () => void;
  fetchUserInfo: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,

      setToken: (token) => set({ token, isAuthenticated: true }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null, isAuthenticated: false }),

      fetchUserInfo: async () => {
        const { token } = get();
        if (!token) return;

        try {
          const response = await fetch(`${BACKEND_API_BASE_URL}/github/user/info`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          if (response.ok) {
            const user = await response.json();
            set({ user });
          } else if (response.status === 401) {
            set({ token: null, user: null, isAuthenticated: false });
          }
        } catch (error) {
          console.error('Failed to fetch user info:', error);
        }
      },
    }),
    {
      name: 'everpay-auth-storage',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
