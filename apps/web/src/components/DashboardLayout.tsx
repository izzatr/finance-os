import { Outlet, useMatch } from 'react-router-dom'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from './AppSidebar'
import { CommandPalette } from './CommandPalette'
import { MobileTabBar } from './MobileTabBar'
import { QuickAddProvider } from '@/contexts/QuickAddContext'
import { QuickAddSheet } from './QuickAddSheet'
import { RouteErrorBoundary } from './RouteErrorBoundary'
import { CurrencyGate } from './CurrencyGate'

export function DashboardLayout() {
  const walletPage = useMatch('/wallets/:walletId')
  return (
    <QuickAddProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="pb-tabbar lg:pb-0">
          <RouteErrorBoundary>
            <CurrencyGate>
              <Outlet />
            </CurrencyGate>
          </RouteErrorBoundary>
        </SidebarInset>
        <MobileTabBar />
        <QuickAddSheet pageWalletId={walletPage?.params.walletId} />
        <CommandPalette />
      </SidebarProvider>
    </QuickAddProvider>
  )
}
