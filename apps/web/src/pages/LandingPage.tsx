import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Coins, FileBarChart, Inbox, TrendingUp, Wallet, X } from 'lucide-react'
import { HomePreview, QuickAddPreview } from '../components/landing/AppPreview'

const GITHUB_URL = 'https://github.com/izzatr/finance-os'

function GitHubIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  )
}

const btn = 'inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-5 text-[15px] font-bold no-underline transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2'

function Nav() {
  return (
    <nav className="absolute inset-x-0 top-0 z-20">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-5 pt-[env(safe-area-inset-top)] lg:h-20 lg:px-8">
        <a href="/" className="flex items-center gap-2.5 text-white no-underline">
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-[var(--cream)] text-[15px] font-bold text-[var(--ink)]">F</span>
          <span className="text-[16px] font-bold">Finance OS</span>
        </a>
        <div className="flex items-center gap-1 sm:gap-6">
          <a href="#agents" className="hidden text-[14px] font-semibold text-white/75 no-underline hover:text-white sm:inline">For agents</a>
          <a href="#features" className="hidden text-[14px] font-semibold text-white/75 no-underline hover:text-white sm:inline">Features</a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="flex size-10 items-center justify-center text-white/75 hover:text-white">
            <GitHubIcon className="size-5" />
          </a>
          <Link to="/dashboard" className="inline-flex h-10 items-center rounded-xl bg-white/10 px-4 text-[14px] font-bold text-white no-underline hover:bg-white/15">
            Open app
          </Link>
        </div>
      </div>
    </nav>
  )
}

function Hero() {
  return (
    <header className="relative bg-[var(--ink)] text-white">
      <div className="mx-auto grid max-w-[1120px] items-center gap-12 px-5 pb-0 pt-28 lg:grid-cols-[1fr_auto] lg:gap-16 lg:px-8 lg:pt-40">
        <div className="max-w-[580px]">
          <h1 className="text-[44px] font-bold leading-[1.02] tracking-[-0.035em] text-balance sm:text-[60px] lg:text-[72px]">
            Your money, in one calm place.
          </h1>
          <p className="mt-5 text-[17px] leading-relaxed text-white/75 sm:text-[19px]">
            Wallets in every currency, two-tap expense logging and honest reports. Self-hosted and open source, with an MCP server so your AI agent can do the bookkeeping too.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
            <Link to="/dashboard" className={`${btn} bg-[var(--cream)] text-[var(--ink)] focus-visible:outline-[var(--cream)]`}>
              Open the app <ArrowRight className="size-4" strokeWidth={2.4} />
            </Link>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={`${btn} bg-white/10 text-white ring-1 ring-white/25 focus-visible:outline-white`}>
              <GitHubIcon /> Self-host it
            </a>
          </div>
        </div>
        {/* On phones the preview sits half out of the ink block, like the app's own sheet. */}
        <div className="relative z-10 mx-auto -mb-[260px] lg:-mb-40 lg:[zoom:1.12]">
          <HomePreview />
        </div>
      </div>
    </header>
  )
}

function QuickAdd() {
  const points = [
    ['A keypad, not a keyboard', 'Amount, category, save. The phone keyboard never covers the form, so it works one-handed in a checkout line.'],
    ['It remembers', 'Your last wallet and recent merchants are one tap away, so repeat purchases take a second.'],
    ['Split as you go', 'Paid for dinner? Mark who owes you their share and it shows up under Shared.'],
  ]
  return (
    <section className="bg-[var(--bg-base)] pt-[300px] lg:pt-44">
      <div className="mx-auto grid max-w-[1120px] items-center gap-12 px-5 py-20 lg:grid-cols-[auto_1fr] lg:gap-20 lg:px-8 lg:py-28">
        <div className="order-2 mx-auto lg:order-1">
          <QuickAddPreview />
        </div>
        <div className="order-1 max-w-[520px] lg:order-2">
          <h2 className="text-[34px] font-bold leading-[1.08] tracking-[-0.03em] text-balance sm:text-[44px]">Logged before you leave the till</h2>
          <ul className="mt-8 grid gap-6">
            {points.map(([title, body]) => (
              <li key={title}>
                <p className="text-[17px] font-bold">{title}</p>
                <p className="mt-1 text-[16px] leading-relaxed text-[var(--text-secondary)]">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function Code({ title, children }: { title: string; children: ReactNode }) {
  return (
    <figure className="overflow-hidden rounded-2xl bg-white/[0.06] ring-1 ring-white/15">
      <figcaption className="border-b border-white/10 px-4 py-2.5 text-[12px] font-semibold text-white/65">{title}</figcaption>
      <pre className="whitespace-pre-wrap break-words px-4 py-4 text-[13px] leading-[1.7] text-white/90">{children}</pre>
    </figure>
  )
}

function InboxCard() {
  return (
    <div aria-hidden className="rounded-3xl bg-white p-4 text-[var(--text-primary)] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.6)]">
      <p className="flex items-center gap-2 text-[14px] font-semibold text-[var(--text-secondary)]">
        <Inbox className="size-4" /> Inbox · 1 draft from your agent
      </p>
      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[var(--tint)] px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Blue Bottle Coffee</p>
          <p className="text-[13px] text-[var(--text-tertiary)]">Coffee · Chase · today</p>
        </div>
        <p className="tabular text-[15px] font-semibold">−$6.50</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <span className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white text-[14px] font-semibold ring-1 ring-[var(--border-medium)]"><X className="size-4" /> Reject</span>
        <span className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[var(--ink)] text-[14px] font-bold text-[var(--cream)]"><Check className="size-4" /> Approve</span>
      </div>
    </div>
  )
}

const c = { dim: 'text-white/60', key: 'text-[var(--cream)]', ok: 'text-[#7fd8a8]' }

function Agents() {
  return (
    <section id="agents" className="bg-[var(--ink)] text-white">
      <div className="mx-auto max-w-[1120px] px-5 py-20 lg:px-8 lg:py-28">
        <div className="grid items-end gap-10 lg:grid-cols-[1fr_380px]">
        <div className="max-w-[600px]">
          <h2 className="text-[34px] font-bold leading-[1.08] tracking-[-0.03em] text-balance sm:text-[44px]">Or hand the bookkeeping to your agent</h2>
          <p className="mt-4 text-[17px] leading-relaxed text-white/70">
            Finance OS ships an MCP server, a CLI and a REST API. Point Claude or any MCP client at it and it can log, search and report on your money. By default anything it wants to book waits in your inbox until you approve it.
          </p>
        </div>
        <InboxCard />
        </div>
        <div className="mt-12 grid items-start gap-4 lg:grid-cols-2">
          <Code title="mcp config">
            <span className={c.dim}>{'{'}</span>{'\n'}
            {'  '}<span className={c.key}>"mcpServers"</span>: {'{'}{'\n'}
            {'    '}<span className={c.key}>"finance-os"</span>: {'{'}{'\n'}
            {'      '}"url": <span className={c.ok}>"https://your.instance/mcp"</span>{'\n'}
            {'    }'}{'\n'}
            {'  }'}{'\n'}
            <span className={c.dim}>{'}'}</span>
          </Code>
          <Code title="you → agent">
            <span className={c.dim}>{'> '}</span>blue bottle 6.50 on chase. what did I spend on food this month?{'\n\n'}
            <span className={c.key}>finance_add_transaction</span>
            <span className={c.dim}>{'  → draft sent to your inbox'}</span>{'\n'}
            <span className={c.key}>finance_spending</span>
            <span className={c.dim}>{'(month: "october")'}</span>{'\n\n'}
            {'  Groceries     $412.00'}{'\n'}
            {'  Eating out    $268.00'}{'\n'}
            <span className={c.ok}>{'  ✓ $680.00 on food'}</span>
          </Code>
        </div>
      </div>
    </section>
  )
}

const FEATURES: Array<[typeof Wallet, string, string]> = [
  [Wallet, 'A wallet for everything', 'Banks, e-wallets, cash and credit cards each keep their own balance.'],
  [Coins, 'Every currency', 'USD, EUR, GBP and more side by side, rolled into one net worth.'],
  [TrendingUp, 'Investments too', 'Stocks and ETFs valued at end of day, in their own currency and yours.'],
  [FileBarChart, 'Reports that add up', 'Monthly income and spend, category trends, net worth over time.'],
]

function Features() {
  return (
    <section id="features" className="bg-[var(--bg-base)]">
      <div className="mx-auto max-w-[1120px] px-5 py-20 lg:px-8 lg:py-28">
        <h2 className="max-w-[560px] text-[34px] font-bold leading-[1.08] tracking-[-0.03em] text-balance sm:text-[44px]">Every account, every currency</h2>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(([Icon, title, body]) => (
            <li key={title} className="rounded-3xl bg-[var(--tint)] p-6 ring-1 ring-[var(--border-subtle)]">
              <span className="flex size-11 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--cream)]">
                <Icon className="size-5" strokeWidth={1.8} />
              </span>
              <p className="mt-5 text-[18px] font-bold">{title}</p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--text-secondary)]">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function SelfHost() {
  return (
    <section className="mx-auto max-w-[1120px] bg-[var(--bg-base)] px-5 pb-20 lg:px-8 lg:pb-28">
      <div className="rounded-[32px] bg-[var(--ink)] px-6 py-12 text-white sm:px-12 lg:flex lg:items-center lg:justify-between lg:gap-12 lg:py-14">
        <div className="max-w-[520px]">
          <h2 className="text-[30px] font-bold leading-[1.1] tracking-[-0.03em] text-balance sm:text-[38px]">Up and running in five minutes</h2>
          <p className="mt-3 text-[16px] leading-relaxed text-white/70">Clone the repo, start the stack, open the app. Postgres, API and web come up together.</p>
        </div>
        <div className="mt-8 min-w-0 lg:mt-0 lg:w-[460px]">
          <pre className="whitespace-pre-wrap break-all rounded-2xl bg-white/[0.07] px-4 py-4 text-[13px] leading-[1.8] text-white/90">
            <span className="text-white/60">$ </span>git clone {GITHUB_URL}.git{'\n'}
            <span className="text-white/60">$ </span>cd finance-os && docker compose up -d
          </pre>
          <div className="mt-4 flex flex-wrap gap-3">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={`${btn} bg-[var(--cream)] text-[var(--ink)] focus-visible:outline-[var(--cream)]`}>
              <GitHubIcon /> View on GitHub
            </a>
            <Link to="/dashboard" className={`${btn} bg-white/10 text-white ring-1 ring-white/25 focus-visible:outline-white`}>Open app</Link>
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-base)]">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-4 px-5 py-8 pb-[max(env(safe-area-inset-bottom),2rem)] text-[14px] sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <span className="flex items-center gap-2 font-bold">
          <span className="flex size-6 items-center justify-center rounded-md bg-[var(--ink)] text-[11px] text-[var(--cream)]">F</span> Finance OS
        </span>
        <span className="flex gap-5 font-semibold text-[var(--text-secondary)]">
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="no-underline hover:text-[var(--text-primary)]">GitHub</a>
          <a href={`${GITHUB_URL}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer" className="no-underline hover:text-[var(--text-primary)]">License</a>
          <Link to="/sign-in" className="no-underline hover:text-[var(--text-primary)]">Sign in</Link>
        </span>
      </div>
    </footer>
  )
}

export function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-[var(--bg-base)] text-[var(--text-primary)]">
      <Nav />
      <main>
        <Hero />
        <QuickAdd />
        <Agents />
        <Features />
        <SelfHost />
      </main>
      <Footer />
    </div>
  )
}
