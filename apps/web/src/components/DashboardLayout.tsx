import { Outlet } from 'react-router-dom'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from './AppSidebar'
import { CommandPalette } from './CommandPalette'
import { MobileTabBar } from './MobileTabBar'
import { QuickAddProvider, useQuickAdd } from '@/contexts/QuickAddContext'
import { AddTransactionForm } from './AddTransactionForm'

function QuickAddHost() {
  const { isOpen, closeQuickAdd } = useQuickAdd()
  if (!isOpen) return null
  return <AddTransactionForm onClose={closeQuickAdd} />
}

export function DashboardLayout() {
  return (
    <QuickAddProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="pb-20 lg:pb-0">
          <Outlet />
        </SidebarInset>
        <MobileTabBar />
        <QuickAddHost />
        <CommandPalette />
      </SidebarProvider>
    </QuickAddProvider>
  )
}
