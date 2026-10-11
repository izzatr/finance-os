import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { DashboardLayout } from './components/DashboardLayout'
import { LandingPage } from './pages/LandingPage'
import { SignInPage } from './pages/SignInPage'
import { SignUpPage } from './pages/SignUpPage'
import { DashboardPage } from './pages/DashboardPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { SharedPage } from './pages/SharedPage'
import { FriendPage } from './pages/FriendPage'
import { GroupPage } from './pages/GroupPage'
import { ExpensePage } from './pages/ExpensePage'
import { InvitePage } from './pages/InvitePage'
import { safeNext } from './lib/nextPath'
import { InboxPage } from './pages/InboxPage'
import { AssistantPage } from './pages/AssistantPage'
import { RecurringPage } from './pages/RecurringPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { ReportsPage } from './pages/ReportsPage'
import { WalletsPage } from './pages/WalletsPage'
import { CurrenciesPage } from './pages/CurrenciesPage'
import { WalletDetailPage } from './pages/WalletDetailPage'
import { SettingsAccountPage } from './pages/SettingsAccountPage'
import { SettingsBillingPage } from './pages/SettingsBillingPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { state } = useAuth()
  const location = useLocation()
  if (state.status === 'loading') return null
  if (state.status === 'unauthenticated') {
    const here = `${location.pathname}${location.search}`
    return <Navigate to={here === '/dashboard' ? '/sign-in' : `/sign-in?next=${encodeURIComponent(here)}`} replace />
  }
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { state } = useAuth()
  const location = useLocation()
  if (state.status === 'loading') return null
  if (state.status === 'authenticated') return <Navigate to={safeNext(location.search) ?? '/dashboard'} replace />
  return <>{children}</>
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/sign-in" element={<PublicRoute><SignInPage /></PublicRoute>} />
      <Route path="/sign-up" element={<PublicRoute><SignUpPage /></PublicRoute>} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/shared" element={<SharedPage />} />
        <Route path="/shared/friends/:friendId" element={<FriendPage />} />
        <Route path="/shared/groups/:groupId" element={<GroupPage />} />
        <Route path="/shared/expenses/:expenseId" element={<ExpensePage />} />
        <Route path="/people" element={<Navigate to="/shared" replace />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/assistant" element={<AssistantPage />} />
        <Route path="/recurring" element={<RecurringPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
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
