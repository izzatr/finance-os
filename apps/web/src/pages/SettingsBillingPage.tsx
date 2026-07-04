import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'

interface Plan {
  id: string
  name: string
  price: string
  interval: string
  features: string[]
  highlighted?: boolean
}

const PLANS: Plan[] = [
  {
    id: 'weekly',
    name: 'Weekly',
    price: '€4.99',
    interval: '/week',
    features: [
      'Full access to all features',
      'Unlimited wallets',
      'AI-powered insights',
      'Priority email support',
    ],
  },
  {
    id: 'monthly',
    name: 'Monthly',
    price: '€14.99',
    interval: '/month',
    features: [
      'Full access to all features',
      'Unlimited wallets',
      'AI-powered insights',
      'Priority email support',
    ],
  },
  {
    id: 'yearly',
    name: 'Yearly',
    price: '€99.99',
    interval: '/year',
    features: [
      'Full access to all features',
      'Unlimited wallets',
      'AI-powered insights',
      'Priority email support',
      'Save 44% vs monthly',
    ],
    highlighted: true,
  },
  {
    id: 'lifetime',
    name: 'Lifetime',
    price: '€299',
    interval: ' one-time',
    features: [
      'Full access for life',
      'Unlimited wallets',
      'AI-powered insights',
      'Priority support',
      'One-time payment, yours forever',
    ],
  },
]

const FREE_PLAN_FEATURES = [
  'Up to 3 wallets',
  'Basic transaction tracking',
  'Monthly summary reports',
  'Community support',
]

export function SettingsBillingPage() {
  const { state } = useAuth()

  // Placeholder query — replace with actual subscription fetch when Stripe is wired
  const { isLoading } = useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      // Simulate network delay
      await new Promise((r) => setTimeout(r, 500))
      return { plan: 'free', status: 'active' }
    },
    staleTime: Infinity,
  })

  const user = state.status === 'authenticated' ? state.user : null

  return (
    <main className="max-w-[900px] px-8 md:px-12 pb-24">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-8">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-white/60 px-2.5 py-1.5 text-xs font-medium text-foreground/70 transition-all hover:border-[rgba(91,164,212,0.4)] hover:bg-white/90 hover:text-foreground no-underline"
        >
          <ArrowLeft size={13} />
          Back
        </Link>
        <h1 className="font-heading text-2xl font-medium text-foreground">Subscription</h1>
      </div>

      <div className="flex flex-col gap-8">
        {/* Current plan */}
        <Card>
          <CardHeader>
            <CardTitle>Current Plan</CardTitle>
            <CardDescription>Your active subscription details</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading subscription details…</p>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold text-foreground">Free</span>
                  <Badge variant="outline" className="text-xs">
                    Active
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {user?.email ?? 'No active subscription'}
                </p>
                <div className="flex flex-col gap-2 pt-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    What's included
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {FREE_PLAN_FEATURES.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm text-foreground/80">
                        <Check size={13} className="text-muted-foreground shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Available plans */}
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="font-heading text-xl font-medium text-foreground">Available Plans</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Upgrade to unlock more features and capabilities
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map((plan) => (
              <Card
                key={plan.id}
                className={
                  plan.highlighted
                    ? 'relative border-[rgba(91,164,212,0.5)] bg-gradient-to-b from-white to-sky-50/30 shadow-md'
                    : 'relative'
                }
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium px-3 py-0.5 shadow-sm">
                      Best value
                    </Badge>
                  </div>
                )}

                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">{plan.name}</CardTitle>
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-2xl font-bold text-foreground">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">{plan.interval}</span>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-col gap-3 pt-0">
                  <ul className="flex flex-col gap-1.5">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2 text-xs text-foreground/80"
                      >
                        <Check
                          size={12}
                          className="text-muted-foreground shrink-0 mt-0.5"
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Button
                    variant={plan.highlighted ? 'default' : 'outline'}
                    size="sm"
                    className="w-full mt-auto"
                    render={<Link to="/dashboard" />}
                  >
                    Subscribe
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}