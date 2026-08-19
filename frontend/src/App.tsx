import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
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
import OpportunityFirstPage from './pages/OpportunityFirstPage'
import ExpertPicksPage from './pages/ExpertPicksPage'
import LiveBettingPage from './pages/LiveBettingPage'
import ParlayBuilderPage from './pages/ParlayBuilderPage'
import BankrollPage from './pages/BankrollPage'
import PricingPage from './pages/PricingPage'
import BillingSuccessPage from './pages/BillingSuccessPage'

function AppRoute({ children }: { children: React.ReactNode }) {
  return <Layout>{children}</Layout>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Authentication is intentionally disabled for the public deployment. */}
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/signup" element={<Navigate to="/" replace />} />

        {/* Public application surface */}
        <Route path="/" element={<AppRoute><DashboardPage /></AppRoute>} />
        <Route path="/formulas" element={<AppRoute><FormulasPage /></AppRoute>} />
        <Route path="/pricing" element={<AppRoute><PricingPage /></AppRoute>} />
        <Route path="/billing/success" element={<AppRoute><BillingSuccessPage /></AppRoute>} />
        <Route path="/ev-feed" element={<AppRoute><EVFeedPage /></AppRoute>} />
        <Route path="/arbitrage" element={<AppRoute><ArbitrageFeedPage /></AppRoute>} />
        <Route path="/player-props" element={<AppRoute><PlayerPropsPage /></AppRoute>} />
        <Route path="/opportunity" element={<AppRoute><OpportunityFirstPage /></AppRoute>} />
        <Route path="/expert-picks" element={<AppRoute><ExpertPicksPage /></AppRoute>} />
        <Route path="/live" element={<AppRoute><LiveBettingPage /></AppRoute>} />
        <Route path="/parlay" element={<AppRoute><ParlayBuilderPage /></AppRoute>} />
        <Route path="/bankroll" element={<AppRoute><BankrollPage /></AppRoute>} />
        <Route path="/alerts" element={<AppRoute><AlertsPage /></AppRoute>} />
        <Route path="/models" element={<AppRoute><CustomModelsPage /></AppRoute>} />
        <Route path="/optimization" element={<AppRoute><OptimizationPage /></AppRoute>} />
        <Route path="/ensemble" element={<AppRoute><EnsemblePage /></AppRoute>} />
        <Route path="/ab-testing" element={<AppRoute><ABTestingPage /></AppRoute>} />
        <Route path="/performance" element={<AppRoute><PerformancePage /></AppRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
