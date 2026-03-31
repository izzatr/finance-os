import { Routes, Route } from 'react-router-dom'
import { LandingPage } from './pages/LandingPage'
import { DashboardLayout } from './components/DashboardLayout'
import { DashboardPage } from './pages/DashboardPage'
import { WalletsPage } from './pages/WalletsPage'
import { WalletDetailPage } from './pages/WalletDetailPage'
import { CurrenciesPage } from './pages/CurrenciesPage'
import { ReportsPage } from './pages/ReportsPage'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route element={<DashboardLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/wallets" element={<WalletsPage />} />
        <Route path="/wallets/:walletId" element={<WalletDetailPage />} />
        <Route path="/currencies" element={<CurrenciesPage />} />
        <Route path="/reports" element={<ReportsPage />} />
      </Route>
    </Routes>
  )
}
