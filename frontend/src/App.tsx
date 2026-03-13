import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './stores/auth'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import DashboardPage from './pages/DashboardPage'
import EVFeedPage from './pages/EVFeedPage'
import ArbitrageFeedPage from './pages/ArbitrageFeedPage'
import CustomModelsPage from './pages/CustomModelsPage'
import PerformancePage from './pages/PerformancePage'
import FormulasPage from './pages/FormulasPage'
import OptimizationPage from './pages/OptimizationPage'
import EnsemblePage from './pages/EnsemblePage'
import ABTestingPage from './pages/ABTestingPage'
import AlertsPage from './pages/AlertsPage'
import PlayerPropsPage from './pages/PlayerPropsPage'
import ExpertPicksPage from './pages/ExpertPicksPage'
import LiveBettingPage from './pages/LiveBettingPage'
import ParlayBuilderPage from './pages/ParlayBuilderPage'
import BankrollPage from './pages/BankrollPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  if (isAuthenticated) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const { loadProfile } = useAuthStore()

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/signup" element={<PublicRoute><SignupPage /></PublicRoute>} />
        <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/ev-feed" element={<ProtectedRoute><EVFeedPage /></ProtectedRoute>} />
        <Route path="/arbitrage" element={<ProtectedRoute><ArbitrageFeedPage /></ProtectedRoute>} />
        <Route path="/models" element={<ProtectedRoute><CustomModelsPage /></ProtectedRoute>} />
        <Route path="/performance" element={<ProtectedRoute><PerformancePage /></ProtectedRoute>} />
        <Route path="/formulas" element={<ProtectedRoute><FormulasPage /></ProtectedRoute>} />
        <Route path="/optimization" element={<ProtectedRoute><OptimizationPage /></ProtectedRoute>} />
        <Route path="/ensemble" element={<ProtectedRoute><EnsemblePage /></ProtectedRoute>} />
        <Route path="/ab-testing" element={<ProtectedRoute><ABTestingPage /></ProtectedRoute>} />
        <Route path="/alerts" element={<ProtectedRoute><AlertsPage /></ProtectedRoute>} />
        <Route path="/player-props" element={<ProtectedRoute><PlayerPropsPage /></ProtectedRoute>} />
        <Route path="/expert-picks" element={<ProtectedRoute><ExpertPicksPage /></ProtectedRoute>} />
        <Route path="/live" element={<ProtectedRoute><LiveBettingPage /></ProtectedRoute>} />
        <Route path="/parlay" element={<ProtectedRoute><ParlayBuilderPage /></ProtectedRoute>} />
        <Route path="/bankroll" element={<ProtectedRoute><BankrollPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
