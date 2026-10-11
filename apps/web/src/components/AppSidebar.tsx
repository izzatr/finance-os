import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, PanelLeft, Plus, Search } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { useAuth } from '@/contexts/AuthContext'
import { useQuickAdd } from '@/contexts/QuickAddContext'
import { usePendingInbox } from '@/hooks/use-pending-inbox'
import { useSplitUnread } from '@/hooks/use-split'
import { NAV_GROUPS, isActive } from '@/lib/nav'

const ITEM =
  'relative h-10 gap-3 rounded-xl px-3 text-[14px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--tint)] hover:text-[var(--text-primary)] ' +
  'data-active:bg-[var(--tint-strong)] data-active:font-semibold data-active:text-[var(--text-primary)] data-active:hover:bg-[var(--tint-strong)] ' +
  '[&>svg]:size-[18px] data-active:[&>svg]:text-[var(--ink)]'

function initials(name: string | null | undefined, email: string): string {
  const source = name?.trim() || email
  const parts = source.split(/[\s@.]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (name && parts[1] ? parts[1][0] : '')).toUpperCase() || '?'
}

export function AppSidebar() {
  const location = useLocation()
  const { toggleSidebar } = useSidebar()
  const { openQuickAdd } = useQuickAdd()
  const pending = usePendingInbox()
  const unread = useSplitUnread()
  const auth = useAuth()
  const user = auth.state.status === 'authenticated' ? auth.state.user : null

  return (
    <Sidebar collapsible="icon" className="border-r-[var(--border-subtle)]">
      <SidebarHeader className="gap-3 px-3 pb-2 pt-4 group-data-[collapsible=icon]:px-2">
        <div className="flex h-9 items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center">
          <Link to="/dashboard" className="flex min-w-0 items-center gap-2.5 pl-[5px] text-[var(--text-primary)] no-underline group-data-[collapsible=icon]:hidden">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--ink)] text-[15px] font-bold text-[var(--cream)]">F</span>
            <span className="truncate text-[16px] font-bold tracking-[-0.01em]">Finance OS</span>
          </Link>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
            title="Toggle sidebar (⌘B)"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--tint)] hover:text-[var(--text-primary)]"
          >
            <PanelLeft className="size-[18px]" />
          </button>
        </div>

        <SidebarMenu className="gap-1">
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Add transaction"
              onClick={openQuickAdd}
              className="h-10 justify-center gap-2 rounded-xl bg-[var(--ink)] text-[14px] font-bold text-white hover:bg-[var(--ink-2)] hover:text-white active:bg-[var(--ink-2)] active:text-white [&>svg]:size-[18px] [&>svg]:text-[var(--cream)]"
            >
              <Plus strokeWidth={2.4} />
              <span className="group-data-[collapsible=icon]:hidden">Add transaction</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Search (⌘K)"
              className={ITEM}
              onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
            >
              <Search strokeWidth={1.9} />
              <span className="flex-1">Search</span>
              <kbd className="text-[12px] font-medium text-[var(--text-tertiary)] group-data-[collapsible=icon]:hidden">⌘K</kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label ?? 'main'} className="px-3 py-1.5 group-data-[collapsible=icon]:px-2">
            {group.label && (
              <SidebarGroupLabel className="h-7 px-3 text-[12px] font-semibold text-[var(--text-tertiary)]">{group.label}</SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => {
                  const count = item.badge === 'inbox' ? pending : item.badge === 'shared' ? unread : 0
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={isActive(item, location.pathname)}
                        tooltip={count ? `${item.label} · ${count} ${item.badge === 'shared' ? 'new' : 'waiting'}` : item.label}
                        render={<Link to={item.path} />}
                        className={ITEM}
                      >
                        <item.icon strokeWidth={1.9} />
                        <span className="flex-1">{item.label}</span>
                        {count > 0 && (
                          <>
                            <span className="tabular flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--negative)] px-1.5 text-[11px] font-bold text-white group-data-[collapsible=icon]:hidden">
                              {count > 99 ? '99+' : count}
                            </span>
                            <span aria-hidden className="absolute right-1 top-1 hidden size-2 rounded-full bg-[var(--negative)] ring-2 ring-[var(--sidebar)] group-data-[collapsible=icon]:block" />
                          </>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {user && (
        <SidebarFooter className="border-t border-[var(--border-subtle)] p-3 group-data-[collapsible=icon]:p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={user.email}
                render={<Link to="/settings/account" />}
                className="h-12 gap-3 rounded-xl px-2 hover:bg-[var(--tint)] group-data-[collapsible=icon]:p-0!"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--tint-strong)] text-[12px] font-bold text-[var(--ink)]">
                  {initials(user.name, user.email)}
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[14px] font-semibold text-[var(--text-primary)]">{user.name || 'Account'}</span>
                  <span className="block truncate text-[12px] text-[var(--text-tertiary)]">{user.email}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-[var(--text-tertiary)]" />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
    </Sidebar>
  )
}
