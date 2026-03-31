import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

interface SectionDividerProps {
  title: string
  badge?: string
}

export function SectionDivider({ title, badge }: SectionDividerProps) {
  return (
    <div className="flex items-center gap-4 mb-7">
      <Separator className="flex-1" />
      <h2 className="font-['Cormorant_Garamond',Georgia,serif] italic font-normal text-[26px] text-foreground whitespace-nowrap">
        {title}
      </h2>
      {badge && (
        <Badge variant="secondary" className="text-[10px] font-medium tracking-[0.14em] uppercase whitespace-nowrap">
          {badge}
        </Badge>
      )}
      <Separator className="flex-1" />
    </div>
  )
}
