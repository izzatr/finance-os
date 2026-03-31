import { Card, CardContent } from '@/components/ui/card'

interface Stat {
  label: string
  value: string
  color?: 'positive' | 'negative'
}

interface StatsRowProps {
  stats: Stat[]
}

export function StatsRow({ stats }: StatsRowProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-14">
      {stats.map((stat) => (
        <Card key={stat.label} className="bg-white/60">
          <CardContent className="py-5 px-5">
            <div className="text-[10px] font-medium tracking-[0.16em] uppercase text-muted-foreground mb-1.5">
              {stat.label}
            </div>
            <div
              className={`font-mono text-[22px] font-medium ${
                stat.color === 'positive'
                  ? 'text-[var(--positive)]'
                  : stat.color === 'negative'
                    ? 'text-[var(--negative)]'
                    : 'text-foreground'
              }`}
            >
              {stat.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
