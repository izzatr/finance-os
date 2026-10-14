import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Repeat } from 'lucide-react'
import { getSharedExpenses } from '@/lib/api'
import { splitKeys } from '@/hooks/use-split'
import { REPEAT_OPTIONS } from './ExpenseSheet'
import { payerLine, shortDate } from './ExpenseFeed'
import { ErrorText } from './ui'

/** Everything set to repeat, soonest first, folded away until asked for. Hidden when nothing repeats. */
export function RepeatingExpenses({ mePersonId }: { mePersonId?: string }) {
  const [open, setOpen] = useState(false)
  const query = useQuery({ queryKey: splitKeys.repeating, queryFn: () => getSharedExpenses({ repeating: true, limit: 100 }) })
  const items = [...(query.data?.data ?? [])]
    .filter((e) => e.nextRepeatAt)
    .sort((a, b) => a.nextRepeatAt!.localeCompare(b.nextRepeatAt!))
  if (query.error) return <ErrorText>{query.error.message}</ErrorText>
  if (items.length === 0) return null
  return (
    <section aria-label="Repeating expenses" className="mb-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-2 text-[13.5px] font-semibold text-[var(--text-secondary)]"
      >
        <Repeat className="size-4" />
        <span className="flex-1 text-left">Repeating · {items.length}</span>
        <span className="text-[var(--text-tertiary)]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <ul>
          {items.map((e) => (
            <li key={e.id}>
              <Link to={`/shared/expenses/${e.id}`} className="flex min-h-14 items-center gap-3 rounded-lg py-2 text-[var(--text-primary)] no-underline active:bg-[var(--tint)]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{e.description}</span>
                  <span className="block truncate text-[13px] text-[var(--text-tertiary)]">
                    {REPEAT_OPTIONS.find((r) => r.value === e.repeatInterval)?.label} · {payerLine(e, mePersonId)}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end text-right">
                  <span className="text-[12px] text-[var(--text-tertiary)]">next</span>
                  <span className="tabular whitespace-nowrap text-[14px] font-bold">{shortDate(e.nextRepeatAt!)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
