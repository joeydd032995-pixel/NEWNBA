import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi } from '../lib/api'

interface User {
  id: string
  email: string
  firstName?: string
  lastName?: string
  planType: 'FREE' | 'PRO' | 'PREMIUM'
}

interface AuthStore {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (data: any) => Promise<void>
  logout: () => Promise<void>
  loadProfile: () => Promise<void>
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true })
        try {
          // Tokens are set as httpOnly cookies by the server
          const { data } = await authApi.login(email, password)
          set({ user: data.user, isAuthenticated: true })
        } finally {
          set({ isLoading: false })
        }
      },

      signup: async (formData) => {
        set({ isLoading: true })
        try {
          const { data } = await authApi.signup(formData)
          set({ user: data.user, isAuthenticated: true })
        } finally {
          set({ isLoading: false })
        }
      },

      logout: async () => {
        try { await authApi.logout() } catch {}
        // Server clears httpOnly cookies; we only reset local state
        set({ user: null, isAuthenticated: false })
      },

      loadProfile: async () => {
        try {
          const { data } = await authApi.profile()
          set({ user: data, isAuthenticated: true })
        } catch {
          set({ user: null, isAuthenticated: false })
        }
      },
    }),
    { name: 'auth-storage', partialize: (s) => ({ user: s.user, isAuthenticated: s.isAuthenticated }) }
  )
)
