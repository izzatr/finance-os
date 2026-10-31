import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BarChart3, LayoutGrid, Menu, Plus, Users } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useQuickAdd } from '@/contexts/QuickAddContext'
import { usePendingInbox } from '@/hooks/use-pending-inbox'
import { useSplitUnread } from '@/hooks/use-split'
import { NAV_GROUPS, TAB_PATHS, isActive } from '@/lib/nav'

const TABS = [
  { label: 'Home', icon: LayoutGrid, path: '/dashboard' },
  { label: 'Reports', icon: BarChart3, path: '/reports' },
  { label: 'Shared', icon: Users, path: '/shared' },
] as const

const MORE_GROUPS = NAV_GROUPS
  .map((g) => ({ ...g, items: g.items.filter((i) => !TAB_PATHS.includes(i.path)) }))
  .filter((g) => g.items.length > 0)
const MORE_ITEMS = MORE_GROUPS.flatMap((g) => g.items)

function TabLink({ label, icon: Icon, path, badge = 0 }: { label: string; icon: typeof LayoutGrid; path: string; badge?: number }) {
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
      <span className="relative">
        <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} />
        {badge > 0 && (
          <span
            aria-label={`${badge} new`}
            className="absolute -right-1.5 -top-1 flex size-3.5 items-center justify-center rounded-full bg-[var(--negative)] text-[8px] font-bold text-white"
          >
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>
      {label}
    </Link>
  )
}

export function MobileTabBar() {
  const { openQuickAdd } = useQuickAdd()
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()
  const pendingCount = usePendingInbox()
  const unreadShared = useSplitUnread()
  const moreCount = pendingCount

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

        <TabLink {...TABS[2]} badge={unreadShared} />

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
              MORE_ITEMS.some((item) => isActive(item, location.pathname))
                ? 'text-[var(--ink)]'
                : 'text-[var(--text-tertiary)]'
            }`}
          >
            <span className="relative">
              <Menu className="size-[22px]" strokeWidth={1.8} />
              {moreCount > 0 && (
                <span
                  aria-label={`${moreCount} waiting for you`}
                  className="absolute -right-1.5 -top-1 flex size-3.5 items-center justify-center rounded-full bg-[var(--negative)] text-[8px] font-bold text-white"
                >
                  {moreCount > 9 ? '9+' : moreCount}
                </span>
              )}
            </span>
            More
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[calc(100dvh-24px)] rounded-t-[28px] pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <SheetHeader className="px-5">
              <SheetTitle className="text-[18px] font-bold text-[var(--text-primary)]">More</SheetTitle>
            </SheetHeader>
            <div className="grid gap-3 overflow-y-auto px-2 pb-2">
              {MORE_GROUPS.map((group) => (
                <div key={group.label ?? 'main'}>
                  {group.label && <p className="px-3 pb-1 text-[13px] font-semibold text-[var(--text-tertiary)]">{group.label}</p>}
                  <div className="grid gap-1">
                  {group.items.map((item) => {
                    const active = isActive(item, location.pathname)
                    const count = item.badge === 'inbox' ? pendingCount : item.badge === 'shared' ? unreadShared : 0
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMoreOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={`flex min-h-12 items-center gap-3 rounded-2xl px-3 py-1.5 text-[15px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--tint)] ${active ? 'bg-[var(--tint)]' : ''}`}
                      >
                        <span className={`flex size-9 items-center justify-center rounded-full ${active ? 'bg-[var(--ink)] text-[var(--cream)]' : 'bg-[var(--tint)] text-[var(--ink)]'}`}>
                          <item.icon className="size-[18px]" strokeWidth={1.8} />
                        </span>
                        <span className="flex-1">{item.label}</span>
                        {count > 0 && (
                          <span className="tabular flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--negative)] px-2 text-[12px] font-bold text-white" aria-label={item.badge === 'shared' ? `${count} new` : `${count} waiting for approval`}>{count}</span>
                        )}
                      </Link>
                    )
                  })}
                  </div>
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  )
}
