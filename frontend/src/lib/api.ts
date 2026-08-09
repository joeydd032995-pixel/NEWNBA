/**
 * Frontend API layer - Centralized axios configuration & namespaced API methods
 *
 * This module provides:
 * - Configured axios instance with httpOnly cookie handling
 * - Auto-refresh on 401 (JWT expired) with single retry
 * - Namespaced API exports (authApi, evApi, analyticsApi, etc.)
 * - Consistent error handling across all routes
 *
 * All requests include httpOnly cookies automatically (withCredentials: true).
 * On 401 Unauthorized, the interceptor silently calls /auth/refresh and retries.
 * If refresh fails, clears auth state and redirects to /login.
 *
 * @example
 * // In a component:
 * import { evApi, analyticsApi } from '@/lib/api'
 *
 * const { data } = useQuery({
 *   queryKey: ['ev-feed'],
 *   queryFn: () => evApi.getFeed({ minEV: 0.05, limit: 20 })
 * })
 *
 * // Making a mutation:
 * const mutation = useMutation({
 *   mutationFn: (data) => analyticsApi.createModel(data)
 * })
 */

import axios from 'axios'
import { useAuthStore } from '../stores/auth'

/**
 * API base URL from environment or default to /api
 * Set via VITE_API_URL in .env or environment variable
 */
const API_BASE = import.meta.env.VITE_API_URL || '/api'

/**
 * Main axios instance for all API requests
 *
 * Configuration:
 * - baseURL: API_BASE (http://localhost:3000/api in dev)
 * - withCredentials: true (sends httpOnly cookies automatically)
 * - Has auto-refresh interceptor (on 401, calls /auth/refresh and retries)
 *
 * Never construct axios instances inline; always use this instance.
 */
export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // send/receive httpOnly cookies automatically
})

/**
 * Response interceptor - Auto-refresh JWT on expiration
 *
 * When a 401 is received:
 * 1. Calls POST /auth/refresh (server rotates cookies in response)
 * 2. Retries the original request with new credentials
 * 3. If refresh fails, clears auth state and redirects to /login
 *
 * Skips refresh for auth endpoints to avoid infinite loops.
 */
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
        // Refresh failed – clear auth state then redirect to login so
        // PublicRoute doesn't bounce the user back to a protected page
        await useAuthStore.getState().logout()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

/**
 * Auth API - User authentication and session management
 *
 * @namespace authApi
 * @example
 * const res = await authApi.login('user@example.com', 'password123')
 * const user = await authApi.profile()
 */
export const authApi = {
  /**
   * Login with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<AxiosResponse>} User object and plan type
   */
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),

  /**
   * Register a new user account
   * @param {object} data - Signup data (email, password, firstName, lastName)
   * @returns {Promise<AxiosResponse>} Created user object
   */
  signup: (data: any) => api.post('/auth/signup', data),

  /**
   * Logout and clear session (optional; auto-refresh handles token expiration)
   * @returns {Promise<AxiosResponse>} Success confirmation
   */
  logout: () => api.post('/auth/logout'),

  /**
   * Get current user profile
   * @returns {Promise<AxiosResponse>} Current user object with all fields
   */
  profile: () => api.get('/auth/profile'),

  /**
   * Refresh JWT access token (called auto on 401; can be called manually)
   * @returns {Promise<AxiosResponse>} Success confirmation (sets new httpOnly cookies)
   */
  refresh: () => api.post('/auth/refresh'),
}

/**
 * Sports API - Teams, events, players, markets
 *
 * @namespace sportsApi
 */
export const sportsApi = {
  /**
   * Get all available sports
   * @returns {Promise<AxiosResponse>} Array of sports (name, slug, iconUrl)
   */
  getSports: () => api.get('/sports'),

  /**
   * Get teams for a sport
   * @param {string} slug - Sport slug (e.g., 'nba', 'nfl')
   * @returns {Promise<AxiosResponse>} Array of teams for that sport
   */
  getTeams: (slug: string) => api.get(`/sports/${slug}/teams`),

  /**
   * Get upcoming events for a sport
   * @param {string} slug - Sport slug
   * @param {object} params - Optional filters: limit, offset, startAfter, endBefore
   * @returns {Promise<AxiosResponse>} Paginated array of events
   */
  getEvents: (slug: string, params?: any) => api.get(`/sports/${slug}/events`, { params }),

  /**
   * Get single event details
   * @param {string} id - Event ID
   * @returns {Promise<AxiosResponse>} Event with teams, dates, markets
   */
  getEvent: (id: string) => api.get(`/sports/events/${id}`),

  /**
   * Get all markets (betting lines) for an event
   * @param {string} id - Event ID
   * @returns {Promise<AxiosResponse>} Array of markets (moneyline, spread, totals)
   */
  getEventMarkets: (id: string) => api.get(`/sports/events/${id}/markets`),

  /**
   * Get player statistics and historical data
   * @param {string} id - Player ID
   * @returns {Promise<AxiosResponse>} Player with career stats, recent performance
   */
  getPlayer: (id: string) => api.get(`/sports/players/${id}`),
}

/**
 * Analytics API - Models, formulas, performance tracking
 *
 * @namespace analyticsApi
 */
export const analyticsApi = {
  /**
   * Get 12 preset prediction models
   * @returns {Promise<AxiosResponse>} Array of preset model configs with weights
   */
  getPresetModels: () => api.get('/analytics/formulas/preset-models'),

  /**
   * Get user's custom prediction models
   * @returns {Promise<AxiosResponse>} User's saved custom models
   */
  getModels: () => api.get('/analytics/models'),

  /**
   * Create a new custom prediction model
   * @param {object} data - Model config (name, weights, description)
   * @returns {Promise<AxiosResponse>} Created model with ID
   */
  createModel: (data: any) => api.post('/analytics/models', data),

  /**
   * Update an existing model
   * @param {string} id - Model ID
   * @param {object} data - Updated weights/config
   * @returns {Promise<AxiosResponse>} Updated model
   */
  updateModel: (id: string, data: any) => api.put(`/analytics/models/${id}`, data),

  /**
   * Delete a custom model
   * @param {string} id - Model ID
   * @returns {Promise<AxiosResponse>} Deletion confirmation
   */
  deleteModel: (id: string) => api.delete(`/analytics/models/${id}`),

  /**
   * Clone a model (preset or custom)
   * @param {string} id - Model ID to duplicate
   * @returns {Promise<AxiosResponse>} New cloned model
   */
  duplicateModel: (id: string) => api.post(`/analytics/models/${id}/duplicate`),

  /**
   * Calculate EV for a given market and probability
   * @param {object} data - Calculation inputs (odds, trueProb, stake)
   * @returns {Promise<AxiosResponse>} EV result (ev, evPct, kellyFraction)
   */
  calcEV: (data: any) => api.post('/analytics/formulas/ev', data),

  /**
   * Calculate True Shooting percentage
   * @param {object} data - Player stats (points, FGA, FTA)
   * @returns {Promise<AxiosResponse>} TS% result
   */
  calcTrueShooting: (data: any) => api.post('/analytics/formulas/true-shooting', data),

  /**
   * Calculate Pythagorean win percentage
   * @param {object} data - Team stats (pointsFor, pointsAgainst)
   * @returns {Promise<AxiosResponse>} Pythagorean win% result
   */
  calcPythagorean: (data: any) => api.post('/analytics/formulas/pythagorean', data),

  /**
   * Get leaderboard of top users by ROI/WinRate
   * @returns {Promise<AxiosResponse>} Ranked users with stats
   */
  getLeaderboard: () => api.get('/analytics/leaderboard'),

  /**
   * Get performance summary dashboard for all models
   * @param {number} days - Lookback period in days (default: 30)
   * @returns {Promise<AxiosResponse>} Aggregated ROI, Sharpe, win rate
   */
  getPerformanceDashboard: (days?: number) => api.get('/analytics/performance/dashboard', { params: days ? { days } : undefined }),

  /**
   * Get detailed performance for a specific model
   * @param {string} modelId - Model ID
   * @returns {Promise<AxiosResponse>} Model performance metrics (ROI, Sharpe, calibration)
   */
  getPerformance: (modelId: string) => api.get(`/analytics/performance/${modelId}`),

  /**
   * Get historical daily performance for a model (for charting)
   * @param {string} modelId - Model ID
   * @returns {Promise<AxiosResponse>} Daily P&L series, equity curve
   */
  getPerformanceHistory: (modelId: string) => api.get(`/analytics/performance/${modelId}/history`),
}

/**
 * Expected Value API - Real-time EV opportunity feed
 *
 * @namespace evApi
 */
export const evApi = {
  /**
   * Get limited EV opportunities feed
   *
   * Returns recent positive EV betting opportunities with optional filtering.
   * Results include market details, team/player info, and public betting splits.
   * Uses 30-second cache to balance freshness vs. performance.
   *
   * @param {object} [params] - Optional filter object
   * @param {number} [params.minEV] - Minimum EV percentage (e.g., 0.05 for 5%), default 0
   * @param {string} [params.sport] - Filter by sport slug (e.g., 'nba', 'nfl')
   * @param {number} [params.limit] - Maximum results to return, default 50
   * @returns {Promise<AxiosResponse>} Array of EVMetric objects with market/event enrichment
   *
   * @example
   * // Fetch top NBA EV opportunities above 5%
   * const { data } = await evApi.getFeed({
   *   sport: 'nba',
   *   minEV: 0.05,
   *   limit: 25
   * })
   */
  getFeed: (params?: any) => api.get('/ev/feed', { params }),

  /**
   * Manually trigger EV scan across all markets (admin/background)
   * @returns {Promise<AxiosResponse>} Scan results
   */
  scan: () => api.post('/ev/scan'),
}

/**
 * Arbitrage API - Cross-book arbitrage opportunity detection
 *
 * @namespace arbApi
 */
export const arbApi = {
  /**
   * Get limited arbitrage opportunities feed
   *
   * Returns cross-book arbitrage opportunities where probability-weighted stakes
   * guarantee profit (ROI > 0). Includes optimal stake sizing per book.
   *
   * @param {object} [params] - Optional filter object
   * @param {number} [params.minProfit] - Minimum profit percentage (e.g., 0.02 for 2%), default 0
   * @param {string} [params.sport] - Filter by sport slug (e.g., 'nba', 'nfl')
   * @param {number} [params.limit] - Maximum results to return, default 50
   * @returns {Promise<AxiosResponse>} Array of arbitrage opportunities with optimal stakes
   *
   * @example
   * // Fetch high-profit arbitrage (>2%) for NBA
   * const { data } = await arbApi.getFeed({
   *   sport: 'nba',
   *   minProfit: 0.02,
   *   limit: 10
   * })
   */
  getFeed: (params?: any) => api.get('/arbitrage/feed', { params }),

  /**
   * Manually trigger arbitrage scan across all markets
   * @returns {Promise<AxiosResponse>} Scan results
   */
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
  getAnalyzerData: (marketId: string) => api.get(`/player-props/${marketId}/analyzer`),
  getCheatSheet: (playerId: string, statType: string, line: number) =>
    api.get(`/player-props/players/${playerId}/cheat-sheet`, { params: { statType, line } }),
}

// Parlay Builder & SGP
export const parlayApi = {
  getEventMarkets: (eventId: string) => api.get(`/parlay/event/${eventId}/markets`),
  suggestLegs: (eventId: string, maxLegs = 5) =>
    api.get(`/parlay/sgp/suggest/${eventId}`, { params: { maxLegs } }),
  analyzeSGP: (eventId: string, legs: Array<{ marketId: string; outcome: string }>) =>
    api.post('/parlay/sgp/analyze', { eventId, legs }),
  analyzeParlay: (legs: Array<{ marketId: string; outcome: string }>) =>
    api.post('/parlay/standard', { legs }),
}

// Live Betting
export const liveApi = {
  getGames: () => api.get('/live/games'),
  getLineMovements: (threshold?: number) =>
    api.get('/live/line-movements', { params: threshold ? { threshold } : undefined }),
}

// Expert Picks
export const expertPicksApi = {
  getAll: (params?: any) => api.get('/expert-picks', { params }),
  create: (data: any) => api.post('/expert-picks', data),
  getConsensus: (marketId: string) => api.get(`/expert-picks/${marketId}/consensus`),
  getContrarian: () => api.get('/expert-picks/contrarian'),
  resolve: (id: string, result: 'WIN' | 'LOSS' | 'PUSH') =>
    api.patch(`/expert-picks/${id}/result`, { result }),
}

// Notifications
export const notificationsApi = {
  getAll: (unreadOnly = false) => api.get('/notifications', { params: unreadOnly ? { unread: 'true' } : undefined }),
  getCount: () => api.get('/notifications/count'),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
  evaluate: () => api.post('/notifications/evaluate'),
}

// Bankroll
export const bankrollApi = {
  getPortfolio: (params: { bankroll: number; kellyFraction: number; minEV?: number; sport?: string }) =>
    api.get('/bankroll/portfolio', { params }),
  getStats: () => api.get('/bankroll/stats'),
  calculate: (data: { bankroll: number; odds: number; trueProb: number; fraction: number }) =>
    api.post('/bankroll/calculate', data),
}

// Billing
export const billingApi = {
  createCheckout: (plan: 'PRO' | 'PREMIUM') =>
    api.post<{ url: string }>('/billing/checkout', { plan }).then((r) => r.data),
  createPortal: () =>
    api.post<{ url: string }>('/billing/portal').then((r) => r.data),
  getStatus: () => api.get('/billing/status').then((r) => r.data),
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
