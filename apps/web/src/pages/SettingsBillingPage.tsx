import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader } from '../components/PageHeader'

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
    <main className="w-full max-w-[900px] px-4 pb-8 pt-6 lg:px-12 lg:pt-10">
      {/* Page header */}
      <PageHeader title="Subscription" />

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
                  <p className="text-[13px] font-semibold text-[var(--text-secondary)]">
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
            <h2 className="text-[18px] font-bold text-foreground">Available plans</h2>
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
                    ? 'relative border-[var(--ink)] bg-white ring-1 ring-[var(--ink)]'
                    : 'relative'
                }
              >
                {plan.highlighted && (
                  <div className="absolute right-3 top-3">
                    <Badge className="bg-[var(--ink)] hover:bg-[var(--ink)] text-[var(--cream)] text-xs font-medium px-3 py-0.5 shadow-sm">
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
                    nativeButton={false}
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