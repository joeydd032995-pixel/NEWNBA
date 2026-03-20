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
import PricingPage from './pages/PricingPage'
import BillingSuccessPage from './pages/BillingSuccessPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

function PlanRoute({ children, requiredPlan, featureName }: {
  children: React.ReactNode
  requiredPlan: 'PRO' | 'PREMIUM'
  featureName?: string
}) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return (
    <Layout>
      <PlanGate requiredPlan={requiredPlan} featureName={featureName}>{children}</PlanGate>
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
        <Route path="/pricing" element={<ProtectedRoute><PricingPage /></ProtectedRoute>} />
        <Route path="/billing/success" element={<BillingSuccessPage />} />

        {/* FREE */}
        <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/formulas" element={<ProtectedRoute><FormulasPage /></ProtectedRoute>} />

        {/* PRO */}
        <Route path="/ev-feed" element={<PlanRoute requiredPlan="PRO" featureName="EV Feed"><EVFeedPage /></PlanRoute>} />
        <Route path="/arbitrage" element={<PlanRoute requiredPlan="PRO" featureName="Arbitrage"><ArbitrageFeedPage /></PlanRoute>} />
        <Route path="/player-props" element={<PlanRoute requiredPlan="PRO" featureName="Player Props"><PlayerPropsPage /></PlanRoute>} />
        <Route path="/expert-picks" element={<PlanRoute requiredPlan="PRO" featureName="Expert Picks"><ExpertPicksPage /></PlanRoute>} />
        <Route path="/live" element={<PlanRoute requiredPlan="PRO" featureName="Live Betting"><LiveBettingPage /></PlanRoute>} />
        <Route path="/parlay" element={<PlanRoute requiredPlan="PRO" featureName="Parlay Builder"><ParlayBuilderPage /></PlanRoute>} />
        <Route path="/bankroll" element={<PlanRoute requiredPlan="PRO" featureName="Bankroll"><BankrollPage /></PlanRoute>} />
        <Route path="/alerts" element={<PlanRoute requiredPlan="PRO" featureName="Alerts"><AlertsPage /></PlanRoute>} />

        {/* PREMIUM */}
        <Route path="/models" element={<PlanRoute requiredPlan="PREMIUM" featureName="Custom Models"><CustomModelsPage /></PlanRoute>} />
        <Route path="/optimization" element={<PlanRoute requiredPlan="PREMIUM" featureName="GA Optimizer"><OptimizationPage /></PlanRoute>} />
        <Route path="/ensemble" element={<PlanRoute requiredPlan="PREMIUM" featureName="Ensemble"><EnsemblePage /></PlanRoute>} />
        <Route path="/ab-testing" element={<PlanRoute requiredPlan="PREMIUM" featureName="A/B Testing"><ABTestingPage /></PlanRoute>} />
        <Route path="/performance" element={<PlanRoute requiredPlan="PREMIUM" featureName="Performance"><PerformancePage /></PlanRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
