import { create } from 'zustand';
import { sound } from '../lib/sound';

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface UIState {
  sidebarCollapsed: boolean;
  rightPanelOpen: boolean;
  rightPanelTab: 'feed' | 'chat';
  soundEnabled: boolean;
  authModalOpen: boolean;
  authModalTab: 'login' | 'register';
  fairnessModalOpen: boolean;
  toasts: ToastItem[];

  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  setRightPanelTab: (tab: 'feed' | 'chat') => void;
  toggleSound: () => void;
  openAuthModal: (tab?: 'login' | 'register') => void;
  closeAuthModal: () => void;
  openFairnessModal: () => void;
  closeFairnessModal: () => void;
  pushToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  rightPanelOpen: true,
  rightPanelTab: 'feed',
  soundEnabled: true,
  authModalOpen: false,
  authModalTab: 'register',
  fairnessModalOpen: false,
  toasts: [],

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  toggleSound: () =>
    set((s) => {
      const next = !s.soundEnabled;
      sound.enabled = next;
      return { soundEnabled: next };
    }),
  openAuthModal: (tab = 'register') => set({ authModalOpen: true, authModalTab: tab }),
  closeAuthModal: () => set({ authModalOpen: false }),
  openFairnessModal: () => set({ fairnessModalOpen: true }),
  closeFairnessModal: () => set({ fairnessModalOpen: false }),
  pushToast: (message, type = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3600);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
