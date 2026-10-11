import {
  BarChart3,
  CalendarClock,
  CreditCard,
  Globe,
  Inbox,
  LayoutGrid,
  ListOrdered,
  Settings,
  Sparkles,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = { label: string; icon: LucideIcon; path: string; match: string; badge?: 'inbox' }
export type NavGroup = { label: string | null; items: NavItem[] }

/**
 * One navigation map for the desktop sidebar and the phone tab bar + More sheet, so both
 * use the same names (Home, Activity) and the same grouping.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { label: 'Home', icon: LayoutGrid, path: '/dashboard', match: '/dashboard' },
      { label: 'Activity', icon: ListOrdered, path: '/transactions', match: '/transactions' },
      { label: 'Reports', icon: BarChart3, path: '/reports', match: '/reports' },
      { label: 'Inbox', icon: Inbox, path: '/inbox', match: '/inbox', badge: 'inbox' },
      { label: 'Assistant', icon: Sparkles, path: '/assistant', match: '/assistant' },
    ],
  },
  {
    label: 'Money',
    items: [
      { label: 'Wallets', icon: CreditCard, path: '/wallets', match: '/wallets' },
      { label: 'People', icon: Users, path: '/people', match: '/people' },
      { label: 'Recurring', icon: CalendarClock, path: '/recurring', match: '/recurring' },
    ],
  },
  {
    label: 'Setup',
    items: [
      { label: 'Categories', icon: Tags, path: '/categories', match: '/categories' },
      { label: 'Currencies', icon: Globe, path: '/currencies', match: '/currencies' },
      { label: 'Settings', icon: Settings, path: '/settings/account', match: '/settings' },
    ],
  },
]

/** Tabs on the phone bar; everything else lives in the More sheet. */
export const TAB_PATHS = ['/dashboard', '/transactions', '/reports']

export function isActive(item: NavItem, pathname: string): boolean {
  return pathname === item.match || pathname.startsWith(`${item.match}/`)
}
