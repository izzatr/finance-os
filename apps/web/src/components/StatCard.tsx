import { Card, CardContent } from '@/components/ui/card'

type StatCardProps = {
  label: string
  value: number | string
}

export function StatCard({ label, value }: StatCardProps) {
  return (
    <Card className="group relative overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md" style={{ boxShadow: 'var(--shadow-stat)' }}>
      <CardContent className="py-2">
        <span className="font-mono text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <strong className="mt-1 block font-mono text-[1.75rem] font-semibold tracking-tight text-foreground">
          {value}
        </strong>
      </CardContent>
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
    </Card>
  )
}
