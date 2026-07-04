import { Link, useLocation } from 'react-router-dom'
import {
  LayoutGrid,
  ListOrdered,
  BarChart3,
  CalendarClock,
  CreditCard,
  Globe,
  ChevronsLeft,
  Inbox,
  Search,
  Settings,
  Sparkles,
  Tags,
  Users,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutGrid, path: '/dashboard', activePath: '/dashboard' },
  { label: 'Transactions', icon: ListOrdered, path: '/transactions', activePath: '/transactions' },
  { label: 'Reports', icon: BarChart3, path: '/reports', activePath: '/reports' },
  { label: 'Wallets', icon: CreditCard, path: '/wallets', activePath: '/wallets' },
  { label: 'People', icon: Users, path: '/people', activePath: '/people' },
  { label: 'Recurring', icon: CalendarClock, path: '/recurring', activePath: '/recurring' },
  { label: 'Assistant', icon: Sparkles, path: '/assistant', activePath: '/assistant' },
  { label: 'Inbox', icon: Inbox, path: '/inbox', activePath: '/inbox' },
  { label: 'Categories', icon: Tags, path: '/categories', activePath: '/categories' },
  { label: 'Currencies', icon: Globe, path: '/currencies', activePath: '/currencies' },
  { label: 'Settings', icon: Settings, path: '/settings/account', activePath: '/settings' },
]

function SidebarToggle() {
  const { toggleSidebar, state } = useSidebar()
  return (
    <button
      onClick={toggleSidebar}
      className="size-8 flex items-center justify-center rounded-md border border-border/50 bg-white/80 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
      title="Toggle sidebar (Cmd+B)"
    >
      <ChevronsLeft className={`size-[18px] transition-transform ${state === 'collapsed' ? 'rotate-180' : ''}`} />
    </button>
  )
}

export function AppSidebar() {
  const location = useLocation()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:p-2">
        <div className="flex items-center justify-between group-data-[collapsible=icon]:justify-center">
          <span className="text-[13px] font-medium tracking-[0.14em] uppercase text-foreground group-data-[collapsible=icon]:hidden">
            Finance OS
          </span>
          <SidebarToggle />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Search (Cmd+K)"
                  className="h-9 text-[13px] font-normal text-muted-foreground border border-border/40 bg-white/50 hover:bg-white/80"
                  onClick={() => {
                    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
                  }}
                >
                  <Search className="size-[18px]" />
                  <span className="flex-1">Search...</span>
                  <kbd className="ml-auto font-mono text-[10px] text-muted-foreground/60 group-data-[collapsible=icon]:hidden">
                    <span className="rounded border border-border/50 bg-muted/50 px-1 py-px">Cmd K</span>
                  </kbd>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    isActive={item.activePath !== null && location.pathname.startsWith(item.activePath)}
                    tooltip={item.label}
                    render={<Link to={item.path} />}
                    className="h-9 text-[13px] font-normal text-muted-foreground data-active:font-medium data-active:text-foreground"
                  >
                    <item.icon className="size-[18px]" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <div className="flex items-center gap-2 px-2 pt-2 text-[11px] text-muted-foreground group-data-[collapsible=icon]:justify-center">
          <span className="size-1.5 rounded-full bg-[var(--positive)] shadow-[0_0_8px_rgba(58,172,106,0.35)]" />
          <span className="group-data-[collapsible=icon]:hidden">System Online</span>
        </div>
        <div className="px-2 pt-1 text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
          <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[9px]">Cmd</kbd>
          {' + '}
          <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[9px]">B</kbd>
          {' sidebar'}
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
