import type { ReactNode } from 'react'
import { ArrowDownLeft, ArrowLeftRight, BarChart3, Bus, CalendarClock, Coffee, Delete, HeartPulse, Home, LayoutGrid, ListOrdered, Menu, Plus, Receipt, ShoppingBag, ShoppingCart, Users, Utensils, Wallet as WalletIcon } from 'lucide-react'

/*
 * Static, decorative replicas of the real Home and Quick add screens for the landing page.
 * They are not the live components: those size themselves against the viewport (lg: breakpoints,
 * safe-area insets), which breaks inside a 320px phone frame on a desktop screen.
 */

export function PhoneFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden
      className={`relative h-[640px] w-[300px] shrink-0 overflow-hidden rounded-[44px] bg-white text-[var(--text-primary)] shadow-[0_0_0_9px_#1d2740,0_0_0_10.5px_rgba(255,255,255,0.22),0_40px_80px_-24px_rgba(14,23,41,0.55)] select-none ${className}`}
    >
      {children}
      <div className="absolute bottom-2 left-1/2 z-20 h-[5px] w-[110px] -translate-x-1/2 rounded-full bg-[#0a0f1c]" />
    </div>
  )
}

function StatusBar({ light }: { light?: boolean }) {
  return (
    <div className={`flex h-10 items-end justify-between px-7 pb-1 text-[12px] font-semibold ${light ? 'text-white' : 'text-[var(--text-primary)]'}`}>
      <span>9:41</span>
      <span className="flex items-center gap-1">
        <span className="flex items-end gap-[2px]">
          {[4, 6, 8, 10].map((h) => <span key={h} className="w-[3px] rounded-[1px] bg-current" style={{ height: h }} />)}
        </span>
        <span className="ml-1 h-[10px] w-[20px] rounded-[3px] border border-current p-[1.5px] opacity-90"><span className="block h-full w-full rounded-[1px] bg-current" /></span>
      </span>
    </div>
  )
}

const ROWS = [
  { name: 'Whole Foods', meta: 'Groceries · Chase', amount: '−$42.18', Icon: ShoppingCart },
  { name: 'Starbucks', meta: 'Coffee · Chase', amount: '−$3.80', Icon: Coffee },
  { name: 'Netflix', meta: 'Subscriptions · Amex', amount: '−$12.42', Icon: CalendarClock },
]

function TabBar() {
  const tab = (label: string, Icon: typeof Home, on = false) => (
    <span className={`flex flex-col items-center gap-0.5 text-[9px] font-semibold ${on ? 'text-[var(--ink)]' : 'text-[var(--text-tertiary)]'}`}>
      <Icon className="size-[18px]" strokeWidth={on ? 2.2 : 1.8} />
      {label}
    </span>
  )
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 grid h-[70px] grid-cols-5 items-start border-t border-[var(--border-subtle)] bg-white pt-2">
      {tab('Home', LayoutGrid, true)}
      {tab('Activity', ListOrdered)}
      <span className="-mt-2.5 mx-auto flex size-11 items-center justify-center rounded-[14px] bg-[var(--ink)] text-[var(--cream)]">
        <Plus className="size-6" strokeWidth={2.4} />
      </span>
      {tab('Reports', BarChart3)}
      {tab('More', Menu)}
    </div>
  )
}

export function HomePreview() {
  return (
    <PhoneFrame>
      <div className="bg-[var(--ink)] text-white">
        <StatusBar light />
        <div className="px-5 pb-9 pt-3">
          <p className="text-[12px] font-medium text-white/75">Net worth</p>
          <p className="tabular mt-0.5 text-[34px] font-bold leading-none tracking-[-0.03em]">
            $39,421<span className="text-[19px] text-white/60">.80</span>
          </p>
          <p className="mt-2.5 inline-flex rounded-md bg-[var(--cream)] px-2 py-0.5 text-[11px] font-bold text-[var(--ink)]">+$1,284.00 this month</p>
          <div className="mt-4 flex gap-2">
            {[[ArrowLeftRight, 'Transfer'], [Users, 'Shared'], [BarChart3, 'Reports']].map(([Icon, label]) => {
              const I = Icon as typeof Home
              return (
                <span key={label as string} className="flex h-9 flex-1 items-center justify-center gap-1 rounded-xl bg-white/10 text-[11px] font-semibold">
                  <I className="size-3.5" /> {label as string}
                </span>
              )
            })}
          </div>
        </div>
      </div>
      <div className="relative -mt-4 rounded-t-[22px] bg-white px-4 pt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-bold">Wallets</span>
          <span className="text-[11px] font-semibold text-[var(--ink)]">Manage</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[['Checking', 'Chase', '$6,412.20'], ['Invest', 'Fidelity', '$31,880.04'], ['Savings', 'Ally', '$1,043.06'], ['Wallet', 'Cash', '$86.50']].map(([t, n, v]) => (
            <div key={n} className="rounded-xl bg-[var(--tint)] px-2.5 py-2">
              <p className="text-[9.5px] font-semibold text-[var(--text-tertiary)]">{t}</p>
              <p className="truncate text-[11px] font-semibold">{n}</p>
              <p className="tabular text-[13px] font-bold">{v}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-baseline justify-between">
          <span className="text-[15px] font-bold">Activity</span>
          <span className="text-[11px] font-semibold text-[var(--ink)]">See all</span>
        </div>
        <div className="-mx-4 mt-2 flex justify-between bg-[var(--tint)] px-4 py-1 text-[10.5px] font-semibold text-[var(--text-tertiary)]">
          <span>Today</span>
          <span className="tabular">−$58.40</span>
        </div>
        {ROWS.map(({ name, meta, amount, Icon }) => (
          <div key={name} className="flex items-center gap-2.5 py-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-[var(--tint)] text-[var(--ink)]"><Icon className="size-4" strokeWidth={1.8} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold leading-tight">{name}</span>
              <span className="block truncate text-[10.5px] text-[var(--text-tertiary)]">{meta}</span>
            </span>
            <span className="tabular text-[12px] font-semibold">{amount}</span>
          </div>
        ))}
        <div className="flex items-center gap-2.5 py-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-[rgba(18,137,90,0.1)] text-[var(--positive)]"><ArrowDownLeft className="size-4" /></span>
          <span className="min-w-0 flex-1 text-[12px] font-semibold">Paycheck</span>
          <span className="tabular text-[12px] font-semibold text-[var(--positive)]">+$3,450.00</span>
        </div>
      </div>
      <TabBar />
    </PhoneFrame>
  )
}

const CATS: Array<[string, typeof Home]> = [
  ['Groceries', ShoppingCart], ['Eating out', Utensils], ['Transport', Bus], ['Coffee', Coffee],
  ['Bills', Receipt], ['Shopping', ShoppingBag], ['Health', HeartPulse], ['Rent', Home],
]

export function QuickAddPreview() {
  return (
    <PhoneFrame className="bg-[var(--ink)]">
      <StatusBar light />
      <div className="absolute inset-x-0 bottom-0 top-[52px] rounded-t-[24px] bg-white px-4 pt-2">
        <div className="mx-auto mb-2.5 h-1 w-8 rounded-full bg-[var(--tint-strong)]" />
        <div className="flex rounded-[10px] bg-[var(--tint)] p-[2px] text-[11.5px] font-semibold">
          <span className="flex-1 rounded-lg bg-white py-1.5 text-center shadow-[0_1px_2px_rgba(0,0,0,0.08)]">Expense</span>
          <span className="flex-1 py-1.5 text-center text-[var(--text-tertiary)]">Income</span>
        </div>
        <p className="tabular pb-1 pt-4 text-center text-[42px] font-bold leading-none tracking-[-0.03em]">
          <span className="mr-1 align-[12px] text-[22px] text-[var(--text-tertiary)]">$</span>42.18
        </p>
        <div className="mt-2 flex justify-center gap-1.5 text-[10.5px] font-semibold">
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--tint)] px-2.5 py-1"><WalletIcon className="size-3 text-[var(--text-tertiary)]" />Chase</span>
          <span className="rounded-full bg-[var(--tint)] px-2.5 py-1">Today</span>
          <span className="rounded-full bg-[var(--tint)] px-2.5 py-1">Whole Foods</span>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-y-2.5">
          {CATS.map(([label, Icon], i) => (
            <span key={label} className="flex flex-col items-center gap-1">
              <span className={`flex size-10 items-center justify-center rounded-full ${i === 0 ? 'bg-[var(--ink)] text-[var(--cream)] shadow-[0_0_0_2px_#fff,0_0_0_3.5px_var(--ink)]' : 'bg-[var(--tint)] text-[var(--ink)]'}`}>
                <Icon className="size-[18px]" strokeWidth={1.8} />
              </span>
              <span className={`text-[9.5px] font-semibold ${i === 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'}`}>{label}</span>
            </span>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-1.5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((k) => (
            <span key={k} className="tabular flex h-9 items-center justify-center rounded-full bg-[var(--tint)] text-[17px] font-semibold">
              {k === 'del' ? <Delete className="size-[18px]" strokeWidth={1.8} /> : k}
            </span>
          ))}
        </div>
        <div className="mt-2.5 flex h-11 items-center justify-center rounded-xl bg-[var(--ink)] text-[13px] font-bold text-[var(--cream)]">Save expense</div>
      </div>
    </PhoneFrame>
  )
}
