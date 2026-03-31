import { useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'

export interface DateRange {
  from: string
  to: string
  label: string
}

function getPresets(): DateRange[] {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  const startOfMonth = (year: number, month: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-01`

  const startOfWeek = () => {
    const d = new Date(now)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    d.setDate(diff)
    return d.toISOString().split('T')[0]
  }

  return [
    {
      label: 'This Week',
      from: startOfWeek(),
      to: new Date(now.getTime() + 86400000).toISOString().split('T')[0],
    },
    {
      label: 'This Month',
      from: startOfMonth(y, m),
      to: startOfMonth(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1),
    },
    {
      label: 'Last 3 Months',
      from: startOfMonth(m < 3 ? y - 1 : y, (m - 3 + 12) % 12),
      to: startOfMonth(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1),
    },
    {
      label: 'Last 6 Months',
      from: startOfMonth(m < 6 ? y - 1 : y, (m - 6 + 12) % 12),
      to: startOfMonth(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1),
    },
    {
      label: 'This Year',
      from: `${y}-01-01`,
      to: `${y + 1}-01-01`,
    },
    {
      label: 'All Time',
      from: '',
      to: '',
    },
  ]
}

function formatDateShort(dateStr: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface DateRangeFilterProps {
  value: DateRange
  onChange: (range: DateRange) => void
}

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const presets = getPresets()
  const [picking, setPicking] = useState<'from' | 'to' | null>(null)
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined)
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined)

  function applyCustom(from: Date, to: Date) {
    const fromStr = from.toISOString().split('T')[0]
    const toStr = to.toISOString().split('T')[0]
    onChange({ label: 'Custom', from: fromStr, to: toStr })
    setPicking(null)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <CalendarIcon className="size-3.5 text-muted-foreground" />
      {presets.map((preset) => (
        <Button
          key={preset.label}
          variant={value.label === preset.label ? 'default' : 'outline'}
          size="sm"
          className="text-xs h-7"
          onClick={() => onChange(preset)}
        >
          {preset.label}
        </Button>
      ))}

      {/* Custom date range picker */}
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant={value.label === 'Custom' ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7 gap-1"
            />
          }
        >
          <CalendarIcon className="size-3" />
          Custom
        </PopoverTrigger>
        <PopoverContent side="bottom" align="start" className="w-auto p-4 bg-popover rounded-xl border shadow-lg z-50">
          <div className="flex flex-col gap-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Select date range
            </div>
            <div className="flex gap-4">
              <div>
                <div className="text-[11px] text-muted-foreground mb-1">From</div>
                <Calendar
                  mode="single"
                  selected={customFrom}
                  onSelect={(date) => {
                    setCustomFrom(date)
                    if (date && customTo && date <= customTo) {
                      applyCustom(date, customTo)
                    }
                  }}
                  className="rounded-md border"
                />
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground mb-1">To</div>
                <Calendar
                  mode="single"
                  selected={customTo}
                  onSelect={(date) => {
                    setCustomTo(date)
                    if (date && customFrom && customFrom <= date) {
                      applyCustom(customFrom, date)
                    }
                  }}
                  disabled={customFrom ? { before: customFrom } : undefined}
                  className="rounded-md border"
                />
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {value.from && (
        <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground ml-1">
          {formatDateShort(value.from)} — {formatDateShort(value.to)}
        </Badge>
      )}
    </div>
  )
}
