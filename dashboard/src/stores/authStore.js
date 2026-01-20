import { create } from 'zustand';
import { authApi } from '../api/client';
import wsClient from '../api/websocket';

const useAuthStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const data = await authApi.login(email, password);
      localStorage.setItem('token', data.access_token);

      // Get user info
      const user = await authApi.getCurrentUser();

      set({
        token: data.access_token,
        user,
        isAuthenticated: true,
        isLoading: false,
      });

      // Connect WebSocket (non-blocking - don't fail login if WS fails)
      wsClient.connect(data.access_token).catch((err) => {
        console.warn('WebSocket connection failed:', err);
      });

      return true;
    } catch (error) {
      set({
        error: error.response?.data?.detail || 'Login failed',
        isLoading: false,
      });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    wsClient.disconnect();
    set({
      user: null,
      token: null,
      isAuthenticated: false,
    });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ isAuthenticated: false });
      return false;
    }

    try {
      const user = await authApi.getCurrentUser();
      set({ user, isAuthenticated: true });

      // Connect WebSocket (non-blocking)
      wsClient.connect(token).catch((err) => {
        console.warn('WebSocket connection failed:', err);
      });

      return true;
    } catch {
      localStorage.removeItem('token');
      set({ isAuthenticated: false, token: null, user: null });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
