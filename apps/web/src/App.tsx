import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { DashboardLayout } from './components/DashboardLayout'
import { LandingPage } from './pages/LandingPage'
import { SignInPage } from './pages/SignInPage'
import { SignUpPage } from './pages/SignUpPage'
import { DashboardPage } from './pages/DashboardPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { PeoplePage } from './pages/PeoplePage'
import { InboxPage } from './pages/InboxPage'
import { ReportsPage } from './pages/ReportsPage'
import { WalletsPage } from './pages/WalletsPage'
import { CurrenciesPage } from './pages/CurrenciesPage'
import { WalletDetailPage } from './pages/WalletDetailPage'
import { SettingsAccountPage } from './pages/SettingsAccountPage'
import { SettingsBillingPage } from './pages/SettingsBillingPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { state } = useAuth()
  if (state.status === 'loading') return null
  if (state.status === 'unauthenticated') return <Navigate to="/sign-in" replace />
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { state } = useAuth()
  if (state.status === 'loading') return null
  if (state.status === 'authenticated') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/sign-in" element={<PublicRoute><SignInPage /></PublicRoute>} />
      <Route path="/sign-up" element={<PublicRoute><SignUpPage /></PublicRoute>} />
      <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/people" element={<PeoplePage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/wallets" element={<WalletsPage />} />
        <Route path="/currencies" element={<CurrenciesPage />} />
        <Route path="/wallets/:walletId" element={<WalletDetailPage />} />
 <Route path="/settings/account" element={<SettingsAccountPage />} />
        <Route path="/settings/billing" element={<SettingsBillingPage />} />
      </Route>
    </Routes>
  )
}
