import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  BarChart3,
  CreditCard,
  Globe,
  CalendarClock,
  Inbox as InboxIcon,
  LayoutGrid,
  ListOrdered,
  Menu,
  Plus,
  Settings,
  Sparkles,
  Tags,
  Users,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getInbox } from '@/lib/api'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useQuickAdd } from '@/contexts/QuickAddContext'

const TABS = [
  { label: 'Home', icon: LayoutGrid, path: '/dashboard' },
  { label: 'Activity', icon: ListOrdered, path: '/transactions' },
  { label: 'Reports', icon: BarChart3, path: '/reports' },
] as const

const MORE_LINKS = [
  { label: 'Wallets', icon: CreditCard, path: '/wallets' },
  { label: 'People', icon: Users, path: '/people' },
  { label: 'Assistant', icon: Sparkles, path: '/assistant' },
  { label: 'Inbox', icon: InboxIcon, path: '/inbox' },
  { label: 'Recurring', icon: CalendarClock, path: '/recurring' },
  { label: 'Categories', icon: Tags, path: '/categories' },
  { label: 'Currencies', icon: Globe, path: '/currencies' },
  { label: 'Settings', icon: Settings, path: '/settings/account' },
] as const

function TabLink({ label, icon: Icon, path }: { label: string; icon: typeof LayoutGrid; path: string }) {
  const location = useLocation()
  const active = location.pathname.startsWith(path)
  return (
    <Link
      to={path}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
        active ? 'text-[var(--ink)]' : 'text-[var(--text-tertiary)]'
      }`}
    >
      <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} />
      {label}
    </Link>
  )
}

export function MobileTabBar() {
  const { openQuickAdd } = useQuickAdd()
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()
  const inboxQuery = useQuery({ queryKey: ['inbox'], queryFn: getInbox, staleTime: 60_000 })
  const pendingCount = (inboxQuery.data?.data ?? []).filter((p) => p.status === 'pending').length

  return (
    <nav
      aria-label="Primary"
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid h-[62px] grid-cols-5">
        <TabLink {...TABS[0]} />
        <TabLink {...TABS[1]} />

        <div className="flex items-start justify-center">
          <button
            type="button"
            onClick={openQuickAdd}
            aria-label="Add transaction"
            className="-mt-3 flex size-[54px] items-center justify-center rounded-[18px] bg-[var(--ink)] text-[var(--cream)] shadow-[0_6px_16px_rgba(14,23,41,0.22)] transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            <Plus className="size-7" strokeWidth={2.4} />
          </button>
        </div>

        <TabLink {...TABS[2]} />

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
              MORE_LINKS.some((l) => location.pathname.startsWith(l.path))
                ? 'text-[var(--ink)]'
                : 'text-[var(--text-tertiary)]'
            }`}
          >
            <span className="relative">
              <Menu className="size-[22px]" strokeWidth={1.8} />
              {pendingCount > 0 && (
                <span
                  aria-label={`${pendingCount} pending approvals`}
                  className="absolute -right-1.5 -top-1 flex size-3.5 items-center justify-center rounded-full bg-[var(--negative)] text-[8px] font-bold text-white"
                >
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </span>
            More
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-[28px] pb-[max(env(safe-area-inset-bottom),1rem)]">
            <SheetHeader>
              <SheetTitle className="text-[18px] font-bold text-[var(--text-primary)]">More</SheetTitle>
            </SheetHeader>
            <div className="grid gap-1 px-2">
              {MORE_LINKS.map(({ label, icon: Icon, path }) => (
                <Link
                  key={path}
                  to={path}
                  onClick={() => setMoreOpen(false)}
                  className="flex min-h-12 items-center gap-3 rounded-2xl px-3 py-3 text-[15px] font-semibold text-[var(--text-primary)] hover:bg-[var(--tint)] transition-colors"
                >
                  <span className="flex size-9 items-center justify-center rounded-full bg-[var(--tint)] text-[var(--ink)]"><Icon className="size-[18px]" strokeWidth={1.8} /></span>
                  {label}
                </Link>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  )
}
