import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  BarChart3,
  CreditCard,
  Globe,
  LayoutGrid,
  ListOrdered,
  Menu,
  Plus,
  Settings,
} from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useQuickAdd } from '@/contexts/QuickAddContext'

const TABS = [
  { label: 'Home', icon: LayoutGrid, path: '/dashboard' },
  { label: 'Activity', icon: ListOrdered, path: '/transactions' },
  { label: 'Reports', icon: BarChart3, path: '/reports' },
] as const

const MORE_LINKS = [
  { label: 'Wallets', icon: CreditCard, path: '/wallets' },
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
      className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
        active ? 'text-[var(--accent-blue)]' : 'text-[var(--text-tertiary)]'
      }`}
    >
      <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
      {label}
    </Link>
  )
}

export function MobileTabBar() {
  const { openQuickAdd } = useQuickAdd()
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()

  return (
    <nav
      aria-label="Primary"
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-5 h-16">
        <TabLink {...TABS[0]} />
        <TabLink {...TABS[1]} />

        <div className="flex items-start justify-center">
          <button
            type="button"
            onClick={openQuickAdd}
            aria-label="Add transaction"
            className="-mt-5 flex size-14 items-center justify-center rounded-full bg-[var(--accent-blue)] text-white shadow-[0_6px_20px_rgba(91,164,212,0.45)] transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-blue)]"
          >
            <Plus className="size-7" strokeWidth={2.4} />
          </button>
        </div>

        <TabLink {...TABS[2]} />

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
              MORE_LINKS.some((l) => location.pathname.startsWith(l.path))
                ? 'text-[var(--accent-blue)]'
                : 'text-[var(--text-tertiary)]'
            }`}
          >
            <Menu className="size-5" strokeWidth={1.8} />
            More
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl pb-[max(env(safe-area-inset-bottom),1rem)]">
            <SheetHeader>
              <SheetTitle className="text-sm text-[var(--text-secondary)]">More</SheetTitle>
            </SheetHeader>
            <div className="grid gap-1 px-2">
              {MORE_LINKS.map(({ label, icon: Icon, path }) => (
                <Link
                  key={path}
                  to={path}
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--accent-dim)] transition-colors"
                >
                  <Icon className="size-5 text-[var(--text-secondary)]" strokeWidth={1.8} />
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
