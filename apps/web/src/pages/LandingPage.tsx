import { useEffect, useRef, useState } from 'react'
import { ShaderBackground } from '../components/landing/ShaderBackground'
import { TerminalMockup } from '../components/landing/TerminalMockup'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Separator } from '../components/ui/separator'
import '../styles/landing.css'

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15 }
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return { ref, visible }
}

/* ── Nav ── */
function LandingNav() {
  return (
    <nav className="landing-nav">
      <div className="landing-nav-logo">Finance OS</div>
      <div className="landing-nav-links">
        <a href="#features">Features</a>
        <a href="#agent">How It Works</a>
        <a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
        <Button size="sm" render={<a href="/dashboard" />}>
          Get Started
        </Button>
      </div>
    </nav>
  )
}

/* ── Hero ── */
function HeroSection() {
  return (
    <section className="landing-hero">
      <div className="landing-hero-content">
        <Badge variant="outline" className="landing-fade-up landing-eyebrow-badge" style={{ animationDelay: '0.2s' }}>
          Open Source &middot; AI-Agent Native
        </Badge>
        <h1 className="landing-hero-headline landing-fade-up" style={{ animationDelay: '0.4s' }}>
          Your finances,<br />your agent's domain
        </h1>
        <p className="landing-hero-sub landing-fade-up" style={{ animationDelay: '0.6s' }}>
          The financial engine that speaks MCP. Let your AI agent track spending,
          manage wallets, and run reports — or do it yourself.
        </p>
        <div className="landing-fade-up" style={{ animationDelay: '0.8s' }}>
          <TerminalMockup
            tab="terminal"
            animate={false}
            lines={[
              { text: '<span class="tc-comment"># Your agent adds a transaction via MCP</span>' },
              { text: '<span class="tc-prompt">$</span> finance add "Lunch" --amount -18.50 --wallet daily' },
              { text: '<span class="tc-success">✓</span> <span class="tc-dim">Transaction added · Daily · Food &amp; Dining</span>' },
              { text: '' },
              { text: '<span class="tc-prompt">$</span> finance summary --month march' },
              { text: '<span class="tc-dim">  Income      </span><span class="tc-bright">$4,200.00</span>' },
              { text: '<span class="tc-dim">  Spent       </span><span class="tc-bright">$1,847.50</span>' },
              { text: '<span class="tc-dim">  Balance     </span><span class="tc-success">$2,352.50</span>' },
            ]}
          />
        </div>
        <div className="landing-cta-group landing-fade-up" style={{ animationDelay: '1.0s' }}>
          <Button size="lg" render={<a href="https://github.com" target="_blank" rel="noopener noreferrer" />}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
            View on GitHub
          </Button>
          <Button variant="outline" size="lg" render={<a href="/dashboard" />}>
            Try Cloud →
          </Button>
        </div>
      </div>
      <div className="landing-scroll-hint">
        <div className="landing-scroll-arrow" />
      </div>
    </section>
  )
}

/* ── Agent-Native Section ── */
function AgentNativeSection() {
  const header = useScrollReveal()
  const step1 = useScrollReveal()
  const step2 = useScrollReveal()
  const step3 = useScrollReveal()

  return (
    <section id="agent" className="landing-section">
      <div className="landing-section-inner">
        <div ref={header.ref} className={`landing-reveal ${header.visible ? 'visible' : ''}`}>
          <Badge variant="secondary" className="landing-eyebrow-badge mb-4">Built for agents</Badge>
          <h2 className="landing-section-headline">
            Three lines of config.<br />Your agent handles the rest.
          </h2>
          <p className="landing-section-sub">
            Connect any MCP-compatible agent. It discovers your financial tools,
            understands your wallets, and starts managing — no training required.
          </p>
        </div>

        <div className="landing-steps">
          <div ref={step1.ref} className={`landing-step landing-reveal ${step1.visible ? 'visible' : ''}`}>
            <div className="landing-step-number">01</div>
            <div className="landing-step-text">
              <h3>Connect</h3>
              <p>Add Finance OS to your agent's MCP config. One server URL, one API key. Your agent sees every financial tool instantly.</p>
            </div>
            <TerminalMockup
              tab="mcp-config.json"
              lines={[
                { text: '<span class="tc-comment">// Add to your agent\'s MCP servers</span>' },
                { text: '<span class="tc-bright">{</span>' },
                { text: '  <span class="tc-flag">"mcpServers"</span><span class="tc-bright">: {</span>' },
                { text: '    <span class="tc-flag">"finance-os"</span><span class="tc-bright">: {</span>' },
                { text: '      <span class="tc-muted">"url"</span>: <span class="tc-success">"https://your.instance/mcp"</span>' },
                { text: '    <span class="tc-bright">}</span>' },
                { text: '  <span class="tc-bright">}</span>' },
              ]}
            />
          </div>

          <div className="landing-step-connector"><div className="landing-connector-line" /></div>

          <div ref={step2.ref} className={`landing-step landing-reveal ${step2.visible ? 'visible' : ''}`}>
            <div className="landing-step-number">02</div>
            <div className="landing-step-text">
              <h3>Discover</h3>
              <p>Your agent automatically discovers typed tools with full schemas and validation. No training, no prompt engineering. It just works.</p>
            </div>
            <TerminalMockup
              tab="agent · tool discovery"
              lines={[
                { text: '<span class="tc-prompt">→</span> <span class="tc-muted">mcp.tools.list()</span>' },
                { text: '' },
                { text: '<span class="tc-bright">  finance_add_transaction</span>  <span class="tc-dim">Add income or expense</span>' },
                { text: '<span class="tc-bright">  finance_balance</span>         <span class="tc-dim">Check wallet balances</span>' },
                { text: '<span class="tc-bright">  finance_spending</span>        <span class="tc-dim">Spending by category</span>' },
                { text: '<span class="tc-bright">  finance_summary</span>         <span class="tc-dim">Financial overview</span>' },
              ]}
            />
          </div>

          <div className="landing-step-connector"><div className="landing-connector-line" /></div>

          <div ref={step3.ref} className={`landing-step landing-reveal ${step3.visible ? 'visible' : ''}`}>
            <div className="landing-step-number">03</div>
            <div className="landing-step-text">
              <h3>Act</h3>
              <p>Your agent makes real financial decisions with structured, typed responses. Track spending, manage wallets, generate reports — autonomously.</p>
            </div>
            <TerminalMockup
              tab="claude · managing finances"
              lines={[
                { text: '<span class="tc-comment"># "What did I spend this month?"</span>' },
                { text: '<span class="tc-prompt">→</span> <span class="tc-muted">finance_spending(</span><span class="tc-flag">month</span>: <span class="tc-success">"march"</span><span class="tc-muted">)</span>' },
                { text: '' },
                { text: '<span class="tc-muted">  Food &amp; Dining    </span><span class="tc-bright">$342.00</span>  <span class="tc-dim">▓▓▓▓▓▓▓▓░░</span>' },
                { text: '<span class="tc-muted">  Transportation   </span><span class="tc-bright">$128.50</span>  <span class="tc-dim">▓▓▓░░░░░░░</span>' },
                { text: '<span class="tc-muted">  Utilities        </span><span class="tc-bright"> $95.00</span>  <span class="tc-dim">▓▓░░░░░░░░</span>' },
                { text: '<span class="tc-success">  ✓ 3 categories · $565.50 total</span>' },
              ]}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Features Grid ── */
const FEATURES = [
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    title: 'Multi-currency',
    desc: 'Track wallets in USD, EUR, IDR, or any currency. Automatic formatting and per-currency reporting.',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
    title: 'Wallet-based',
    desc: 'Organize money by purpose — daily spending, savings, emergency fund. Each wallet tracks its own balance.',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
    ),
    title: 'Category tracking',
    desc: 'Automatic categorization with spending breakdowns. See where your money goes at a glance.',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    title: 'Reports & trends',
    desc: 'Monthly summaries, spending trends, income vs. expense. Data-driven insights into your financial health.',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: 'Open source',
    desc: 'Self-host with full control. MIT licensed. No vendor lock-in. Your data stays yours, forever.',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9m-9 9a9 9 0 0 1 9-9" />
      </svg>
    ),
    title: 'Cloud option',
    desc: 'Managed hosting for those who don\'t want to run infrastructure. Same MCP interface, zero setup.',
  },
]

function FeaturesGrid() {
  const reveal = useScrollReveal()

  return (
    <section id="features" className="landing-section">
      <div className="landing-section-inner">
        <div ref={reveal.ref} className={`landing-reveal ${reveal.visible ? 'visible' : ''}`}>
          <Badge variant="secondary" className="landing-eyebrow-badge mb-4">Features</Badge>
          <h2 className="landing-section-headline">
            Everything you need.<br />Nothing you don't.
          </h2>
          <p className="landing-section-sub">
            A focused set of financial tools — designed for clarity, built for agents.
          </p>
        </div>
        <div className={`landing-features-grid landing-reveal ${reveal.visible ? 'visible' : ''}`} style={{ animationDelay: '0.3s' }}>
          {FEATURES.map((f, i) => (
            <Card key={i} className="landing-feature-card">
              <CardContent className="pt-6">
                <div className="landing-feature-icon">{f.icon}</div>
                <CardTitle className="landing-feature-title">{f.title}</CardTitle>
                <CardDescription className="landing-feature-desc">{f.desc}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Pricing Comparison ── */
function PricingComparison() {
  const reveal = useScrollReveal()

  return (
    <section className="landing-section">
      <div className="landing-section-inner">
        <div ref={reveal.ref} className={`landing-reveal ${reveal.visible ? 'visible' : ''}`}>
          <Badge variant="secondary" className="landing-eyebrow-badge mb-4">Deploy your way</Badge>
          <h2 className="landing-section-headline">
            Self-host or let us<br />handle the infrastructure.
          </h2>
          <p className="landing-section-sub">
            Same engine, same MCP interface. Choose what works for you.
          </p>
        </div>
        <div className={`landing-pricing-grid landing-reveal ${reveal.visible ? 'visible' : ''}`} style={{ animationDelay: '0.3s' }}>
          <Card className="landing-pricing-card">
            <CardHeader>
              <Badge variant="outline" className="w-fit">Open Source</Badge>
              <div className="landing-pricing-price">Free</div>
              <CardDescription>Self-host on your own infrastructure. Full control over your data and deployment.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="landing-pricing-list">
                <li><span className="landing-check">✓</span> Full source code access</li>
                <li><span className="landing-check">✓</span> MIT licensed</li>
                <li><span className="landing-check">✓</span> CLI + MCP interface</li>
                <li><span className="landing-check">✓</span> Community support</li>
                <li><span className="landing-check">✓</span> Your server, your data</li>
              </ul>
              <Button variant="outline" className="w-full" render={<a href="https://github.com" target="_blank" rel="noopener noreferrer" />}>
                View on GitHub
              </Button>
            </CardContent>
          </Card>

          <Card className="landing-pricing-card landing-pricing-featured">
            <CardHeader>
              <Badge className="w-fit">Cloud</Badge>
              <div className="landing-pricing-price">Coming soon</div>
              <CardDescription>Managed hosting with zero setup. Connect your agent and start managing finances in minutes.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="landing-pricing-list">
                <li><span className="landing-check">✓</span> Zero infrastructure</li>
                <li><span className="landing-check">✓</span> Same MCP interface</li>
                <li><span className="landing-check">✓</span> Automatic backups</li>
                <li><span className="landing-check">✓</span> Priority support</li>
                <li><span className="landing-check">✓</span> Team collaboration</li>
              </ul>
              <Button className="w-full" render={<a href="/dashboard" />}>
                Join Waitlist
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}

/* ── Footer ── */
function LandingFooter() {
  return (
    <footer className="landing-footer">
      <Separator />
      <div className="landing-footer-inner">
        <div className="landing-footer-brand">
          <span className="landing-footer-logo">Finance OS</span>
          <span className="landing-footer-tagline">Made for agents, by humans.</span>
        </div>
        <div className="landing-footer-links">
          <a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
          <a href="/dashboard">Dashboard</a>
          <a href="#features">Features</a>
          <a href="#agent">How It Works</a>
        </div>
      </div>
    </footer>
  )
}

/* ── Floating Particles ── */
function FloatingParticles() {
  return (
    <div className="landing-particles" aria-hidden="true">
      {[...Array(6)].map((_, i) => (
        <div key={i} className={`landing-particle landing-particle-${i + 1}`} />
      ))}
    </div>
  )
}

/* ── Page ── */
export function LandingPage() {
  return (
    <div className="landing-page">
      <ShaderBackground />
      <FloatingParticles />
      <LandingNav />
      <HeroSection />
      <AgentNativeSection />
      <FeaturesGrid />
      <PricingComparison />
      <LandingFooter />
    </div>
  )
}
