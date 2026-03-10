import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // send/receive httpOnly cookies automatically
})

// Response interceptor – on 401 silently try one cookie-based refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const isAuthEndpoint = originalRequest?.url?.includes('/auth/')
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true
      try {
        // Cookies are sent automatically; the server rotates them in the response
        await axios.post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true })
        return api(originalRequest)
      } catch {
        // Refresh failed – redirect to login
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// Auth
export const authApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  signup: (data: any) => api.post('/auth/signup', data),
  logout: () => api.post('/auth/logout'),
  profile: () => api.get('/auth/profile'),
  refresh: () => api.post('/auth/refresh'),
}

// Sports
export const sportsApi = {
  getSports: () => api.get('/sports'),
  getTeams: (slug: string) => api.get(`/sports/${slug}/teams`),
  getEvents: (slug: string, params?: any) => api.get(`/sports/${slug}/events`, { params }),
  getEvent: (id: string) => api.get(`/sports/events/${id}`),
  getEventMarkets: (id: string) => api.get(`/sports/events/${id}/markets`),
  getPlayer: (id: string) => api.get(`/sports/players/${id}`),
}

// Analytics
export const analyticsApi = {
  getPresetModels: () => api.get('/analytics/formulas/preset-models'),
  getModels: () => api.get('/analytics/models'),
  createModel: (data: any) => api.post('/analytics/models', data),
  updateModel: (id: string, data: any) => api.put(`/analytics/models/${id}`, data),
  deleteModel: (id: string) => api.delete(`/analytics/models/${id}`),
  duplicateModel: (id: string) => api.post(`/analytics/models/${id}/duplicate`),
  calcEV: (data: any) => api.post('/analytics/formulas/ev', data),
  calcTrueShooting: (data: any) => api.post('/analytics/formulas/true-shooting', data),
  calcPythagorean: (data: any) => api.post('/analytics/formulas/pythagorean', data),
  getLeaderboard: () => api.get('/analytics/leaderboard'),
  getPerformance: (modelId: string) => api.get(`/analytics/performance/${modelId}`),
  getPerformanceHistory: (modelId: string) => api.get(`/analytics/performance/${modelId}/history`),
}

// EV Feed
export const evApi = {
  getFeed: (params?: any) => api.get('/ev/feed', { params }),
  scan: () => api.post('/ev/scan'),
}

// Arbitrage
export const arbApi = {
  getFeed: (params?: any) => api.get('/arbitrage/feed', { params }),
  scan: () => api.post('/arbitrage/scan'),
}

// Optimization
export const optimizationApi = {
  getRuns: () => api.get('/analytics/optimization'),
  createRun: (data: any) => api.post('/analytics/optimization', data),
  getRun: (id: string) => api.get(`/analytics/optimization/${id}`),
  startRun: (id: string) => api.post(`/analytics/optimization/${id}/start`),
  cancelRun: (id: string) => api.post(`/analytics/optimization/${id}/cancel`),
}

// Ensemble
export const ensembleApi = {
  getAll: () => api.get('/analytics/ensemble'),
  create: (data: any) => api.post('/analytics/ensemble', data),
  getOne: (id: string) => api.get(`/analytics/ensemble/${id}`),
  update: (id: string, data: any) => api.put(`/analytics/ensemble/${id}`, data),
  remove: (id: string) => api.delete(`/analytics/ensemble/${id}`),
  optimizeWeights: (id: string) => api.post(`/analytics/ensemble/${id}/optimize-weights`),
}

// Alerts
export const alertsApi = {
  getAll: () => api.get('/alerts'),
  create: (data: any) => api.post('/alerts', data),
  update: (id: string, data: any) => api.patch(`/alerts/${id}`, data),
  remove: (id: string) => api.delete(`/alerts/${id}`),
  toggle: (id: string) => api.patch(`/alerts/${id}/toggle`),
}

// Player Props
export const playerPropsApi = {
  getFeed: (params?: any) => api.get('/player-props/feed', { params }),
  getPlayers: () => api.get('/player-props/players'),
}

// A/B Testing
export const abTestApi = {
  getAll: () => api.get('/analytics/ab-tests'),
  create: (data: any) => api.post('/analytics/ab-tests', data),
  getOne: (id: string) => api.get(`/analytics/ab-tests/${id}`),
  start: (id: string) => api.post(`/analytics/ab-tests/${id}/start`),
  stop: (id: string) => api.post(`/analytics/ab-tests/${id}/stop`),
  analyze: (id: string) => api.get(`/analytics/ab-tests/${id}/analyze`),
  record: (id: string, data: any) => api.post(`/analytics/ab-tests/${id}/record`, data),
  remove: (id: string) => api.delete(`/analytics/ab-tests/${id}`),
}
