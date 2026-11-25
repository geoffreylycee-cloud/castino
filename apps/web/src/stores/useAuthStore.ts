import { create } from 'zustand';
import type { UserDTO } from '@castino/shared';
import { apiFetch, getStoredToken, setStoredToken } from '../lib/api';
import { refreshSocketAuth } from '../lib/socket';

interface AuthState {
  user: UserDTO | null;
  loading: boolean;
  initAuth: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  continueAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
  setBalance: (balance: number) => void;
  setUser: (user: UserDTO) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  initAuth: async () => {
    set({ loading: true });
    const existingToken = getStoredToken();

    if (existingToken) {
      try {
        const { user } = await apiFetch<{ user: UserDTO }>('/api/auth/me');
        set({ user, loading: false });
        refreshSocketAuth();
        return;
      } catch {
        setStoredToken(null);
      }
    }

    // Créer automatiquement une session Invité persistante pour jouer immédiatement
    try {
      const { token, user } = await apiFetch<{ token: string; user: UserDTO }>('/api/auth/guest', {
        method: 'POST',
      });
      setStoredToken(token);
      set({ user, loading: false });
      refreshSocketAuth();
    } catch {
      set({ user: null, loading: false });
    }
  },

  login: async (username, password) => {
    const { token, user } = await apiFetch<{ token: string; user: UserDTO }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setStoredToken(token);
    set({ user });
    refreshSocketAuth();
  },

  register: async (username, password) => {
    const { token, user } = await apiFetch<{ token: string; user: UserDTO }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setStoredToken(token);
    set({ user });
    refreshSocketAuth();
  },

  continueAsGuest: async () => {
    const { token, user } = await apiFetch<{ token: string; user: UserDTO }>('/api/auth/guest', {
      method: 'POST',
    });
    setStoredToken(token);
    set({ user });
    refreshSocketAuth();
  },

  logout: async () => {
    setStoredToken(null);
    const { token, user } = await apiFetch<{ token: string; user: UserDTO }>('/api/auth/guest', {
      method: 'POST',
    });
    setStoredToken(token);
    set({ user });
    refreshSocketAuth();
  },

  setBalance: (balance) =>
    set((state) => (state.user ? { user: { ...state.user, balance } } : state)),

  setUser: (user) => set({ user }),
}));
