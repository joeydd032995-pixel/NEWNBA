import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './stores/auth'
import Layout from './components/Layout'
import PlanGate from './components/PlanGate'
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

function ProRoute({ children, featureName }: { children: React.ReactNode; featureName?: string }) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return (
    <Layout>
      <PlanGate requiredPlan="PRO" featureName={featureName}>{children}</PlanGate>
    </Layout>
  )
}

function PremiumRoute({ children, featureName }: { children: React.ReactNode; featureName?: string }) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return (
    <Layout>
      <PlanGate requiredPlan="PREMIUM" featureName={featureName}>{children}</PlanGate>
    </Layout>
  )
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
        {/* Public */}
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/signup" element={<PublicRoute><SignupPage /></PublicRoute>} />

        {/* FREE */}
        <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/formulas" element={<ProtectedRoute><FormulasPage /></ProtectedRoute>} />

        {/* PRO */}
        <Route path="/ev-feed" element={<ProRoute featureName="EV Feed"><EVFeedPage /></ProRoute>} />
        <Route path="/arbitrage" element={<ProRoute featureName="Arbitrage"><ArbitrageFeedPage /></ProRoute>} />
        <Route path="/player-props" element={<ProRoute featureName="Player Props"><PlayerPropsPage /></ProRoute>} />
        <Route path="/expert-picks" element={<ProRoute featureName="Expert Picks"><ExpertPicksPage /></ProRoute>} />
        <Route path="/live" element={<ProRoute featureName="Live Betting"><LiveBettingPage /></ProRoute>} />
        <Route path="/parlay" element={<ProRoute featureName="Parlay Builder"><ParlayBuilderPage /></ProRoute>} />
        <Route path="/bankroll" element={<ProRoute featureName="Bankroll"><BankrollPage /></ProRoute>} />
        <Route path="/alerts" element={<ProRoute featureName="Alerts"><AlertsPage /></ProRoute>} />

        {/* PREMIUM */}
        <Route path="/models" element={<PremiumRoute featureName="Custom Models"><CustomModelsPage /></PremiumRoute>} />
        <Route path="/optimization" element={<PremiumRoute featureName="GA Optimizer"><OptimizationPage /></PremiumRoute>} />
        <Route path="/ensemble" element={<PremiumRoute featureName="Ensemble"><EnsemblePage /></PremiumRoute>} />
        <Route path="/ab-testing" element={<PremiumRoute featureName="A/B Testing"><ABTestingPage /></PremiumRoute>} />
        <Route path="/performance" element={<PremiumRoute featureName="Performance"><PerformancePage /></PremiumRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
