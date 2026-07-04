import { Outlet } from 'react-router-dom'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from './AppSidebar'
import { CommandPalette } from './CommandPalette'
import { MobileTabBar } from './MobileTabBar'
import { QuickAddProvider } from '@/contexts/QuickAddContext'
import { QuickAddSheet } from './QuickAddSheet'
import { RouteErrorBoundary } from './RouteErrorBoundary'

export function DashboardLayout() {
  return (
    <QuickAddProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="pb-20 lg:pb-0">
          <RouteErrorBoundary>
            <Outlet />
          </RouteErrorBoundary>
        </SidebarInset>
        <MobileTabBar />
        <QuickAddSheet />
        <CommandPalette />
      </SidebarProvider>
    </QuickAddProvider>
  )
}
