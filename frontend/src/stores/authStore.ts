/**
 * Auth Store - Simplified for Cloudflare Access
 *
 * Authentication is handled by Cloudflare Access (Google SSO).
 * This store just tracks user info and encryption key status.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface User {
  id: string;
  email: string;
  tenantId: string;
  role: 'USER' | 'ADMIN';
  publicKey: string | null;
  keyFingerprint: string | null;
  hasEncryptionKeys: boolean;
  hasWrappedKey: boolean;
  dataVersion: number;
  storageUsed: number;
  requestCount: number;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasEncryptionKeys: boolean;

  checkAuth: () => Promise<void>;
  logout: () => void;
  setHasKeys: (hasKeys: boolean) => void;
  updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      hasEncryptionKeys: false,

      checkAuth: async () => {
        set({ isLoading: true });
        try {
          const res = await fetch(`${API_BASE}/auth/me`);

          if (res.ok) {
            const data = await res.json();

            set({
              user: data,
              isAuthenticated: true,
              hasEncryptionKeys: !!data.hasEncryptionKeys,
              isLoading: false,
            });

            // Only redirect to key setup on first onboarding (no keys set yet)
            if (!data.hasEncryptionKeys) {
              if (!window.location.pathname.includes('/setup-keys')) {
                window.location.href = '/setup-keys';
              }
            }
          } else {
            // Not authenticated - redirect to Cloudflare Access login
            set({
              user: null,
              isAuthenticated: false,
              isLoading: false,
            });
            // Cloudflare Access will handle the redirect
          }
        } catch (error) {
          console.error('Auth check failed:', error);
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      logout: () => {
        // Redirect to Cloudflare Access logout
        window.location.href = '/cdn-cgi/access/logout';
      },

      setHasKeys: (hasKeys) => {
        set({ hasEncryptionKeys: hasKeys });
        if (get().user) {
          set({
            user: { ...get().user!, hasEncryptionKeys: hasKeys } as User,
          });
        }
      },

      updateUser: (updates) => {
        if (get().user) {
          set({ user: { ...get().user!, ...updates } });
        }
      },
    }),
    {
      name: '2hjs-auth',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
