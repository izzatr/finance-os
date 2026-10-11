import { Check } from 'lucide-react'
import { currencyPrecision, currencySymbolFor, previewPaid, previewSplit, formatMinor, type PaidDraft, type SplitDraft, type SplitMethod } from '@/lib/split'
import { Avatar, Segmented } from './ui'

export type Participant = { personId: string; name: string; isMe: boolean }

const METHODS: Array<{ value: SplitMethod; label: string; ariaLabel: string; hint: string }> = [
  { value: 'equal', label: '=', ariaLabel: 'Split equally', hint: 'Split equally' },
  { value: 'exact', label: '1.23', ariaLabel: 'Split by exact amounts', hint: 'Split by exact amounts' },
  { value: 'percent', label: '%', ariaLabel: 'Split by percentages', hint: 'Split by percentages' },
  { value: 'shares', label: 'shares', ariaLabel: 'Split by shares', hint: 'Split by shares' },
  { value: 'adjustment', label: '+/−', ariaLabel: 'Split by adjustment', hint: 'Equal, then add extra for some people' },
]

export function personLabel(p: Participant) {
  return p.isMe ? 'You' : p.name
}

const numberInput =
  'tabular h-10 w-24 shrink-0 rounded-lg border border-[var(--border-medium)] bg-white px-2.5 text-right text-[15px] outline-none focus-visible:border-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--ink)]/15'

function NumberField({ value, onChange, label, prefix, suffix, decimals }: { value: string; onChange: (v: string) => void; label: string; prefix?: string; suffix?: string; decimals?: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {prefix && <span className="text-[13px] font-semibold text-[var(--text-tertiary)]">{prefix}</span>}
      <input
        inputMode={decimals === false ? 'numeric' : 'decimal'}
        value={value}
        placeholder="0"
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={numberInput}
      />
      {suffix && <span className="w-12 text-[13px] font-semibold text-[var(--text-tertiary)]">{suffix}</span>}
    </span>
  )
}

/** "How was it split?" view: = / 1.23 / % / shares / +/- with a live running total. */
export function SplitView({ participants, draft, onChange, cost, currency }: {
  participants: Participant[]
  draft: SplitDraft
  onChange: (d: SplitDraft) => void
  cost: string
  currency: string
}) {
  const ids = participants.map((p) => p.personId)
  const preview = previewSplit(cost, currency, draft, ids)
  const method = METHODS.find((m) => m.value === draft.method)!
  const symbol = currencySymbolFor(currency)
  const wholeOnly = currencyPrecision(currency) === 0

  function toggle(id: string) {
    const included = draft.included.includes(id) ? draft.included.filter((x) => x !== id) : [...draft.included, id]
    onChange({ ...draft, included })
  }
  const setRec = (key: 'amounts' | 'percents' | 'shares' | 'adjustments', id: string, v: string) =>
    onChange({ ...draft, [key]: { ...draft[key], [id]: v } })

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        label="Split method"
        value={draft.method}
        onChange={(m) => onChange({ ...draft, method: m })}
        options={METHODS.map((m) => ({ value: m.value, label: m.label, ariaLabel: m.ariaLabel }))}
      />
      <p className="text-[15px] font-bold text-[var(--text-primary)]">{method.hint}</p>
      <ul className="flex flex-col">
        {participants.map((p) => {
          const owed = preview.owed?.get(p.personId)
          const included = draft.included.includes(p.personId)
          const share = owed !== undefined ? formatMinor(owed, currency) : null
          return (
            <li key={p.personId} className="flex min-h-14 items-center gap-3 py-1.5">
              <Avatar name={p.name} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-[var(--text-primary)]">{personLabel(p)}</span>
                {share && draft.method !== 'exact' && (draft.method === 'percent' || draft.method === 'shares' || included) && (
                  <span className="tabular block text-[13px] text-[var(--text-tertiary)]">{share}</span>
                )}
              </span>
              {draft.method === 'equal' && (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={included}
                  aria-label={`Include ${personLabel(p)}`}
                  onClick={() => toggle(p.personId)}
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 ${included ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--cream)]' : 'border-[var(--border-medium)] bg-white'}`}
                >
                  {included && <Check className="size-4" strokeWidth={3} />}
                </button>
              )}
              {draft.method === 'exact' && (
                <NumberField label={`Amount for ${personLabel(p)}`} prefix={symbol} value={draft.amounts[p.personId] ?? ''} onChange={(v) => setRec('amounts', p.personId, v)} decimals={!wholeOnly} />
              )}
              {draft.method === 'percent' && (
                <NumberField label={`Percent for ${personLabel(p)}`} suffix="%" value={draft.percents[p.personId] ?? ''} onChange={(v) => setRec('percents', p.personId, v)} />
              )}
              {draft.method === 'shares' && (
                <NumberField label={`Shares for ${personLabel(p)}`} suffix="shares" value={draft.shares[p.personId] ?? ''} onChange={(v) => setRec('shares', p.personId, v)} />
              )}
              {draft.method === 'adjustment' && (
                <span className="flex shrink-0 items-center gap-2">
                  <NumberField label={`Extra for ${personLabel(p)}`} prefix={`+${symbol}`} value={draft.adjustments[p.personId] ?? ''} onChange={(v) => setRec('adjustments', p.personId, v)} decimals={!wholeOnly} />
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={included}
                    aria-label={`Include ${personLabel(p)}`}
                    onClick={() => toggle(p.personId)}
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 ${included ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--cream)]' : 'border-[var(--border-medium)] bg-white'}`}
                  >
                    {included && <Check className="size-4" strokeWidth={3} />}
                  </button>
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <div className="sticky bottom-0 -mx-4 bg-white px-4 py-3 lg:-mx-5 lg:px-5" aria-live="polite">
        <p className="tabular text-center text-[14px] font-semibold text-[var(--text-primary)]" data-testid="split-summary">{preview.summary}</p>
        {preview.error && <p role="alert" className="mt-1 text-center text-[13px] font-medium text-[var(--negative)]">{preview.error}</p>}
      </div>
    </div>
  )
}

/** "Who paid?" view: one person, or several with amounts and a running total. */
export function PaidByView({ participants, draft, onChange, cost, currency }: {
  participants: Participant[]
  draft: PaidDraft
  onChange: (d: PaidDraft) => void
  cost: string
  currency: string
}) {
  const ids = participants.map((p) => p.personId)
  const preview = previewPaid(cost, currency, draft, ids)
  const symbol = currencySymbolFor(currency)
  const multiple = draft.mode === 'multiple'
  return (
    <div className="flex flex-col gap-1">
      <ul className="flex flex-col">
        {participants.map((p) => {
          const selected = draft.mode === 'single' && draft.personId === p.personId
          return (
            <li key={p.personId}>
              {multiple ? (
                <div className="flex min-h-14 items-center gap-3 py-1.5">
                  <Avatar name={p.name} size={36} />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{personLabel(p)}</span>
                  <NumberField
                    label={`${personLabel(p)} paid`}
                    prefix={symbol}
                    value={draft.mode === 'multiple' ? draft.amounts[p.personId] ?? '' : ''}
                    onChange={(v) => draft.mode === 'multiple' && onChange({ mode: 'multiple', amounts: { ...draft.amounts, [p.personId]: v } })}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onChange({ mode: 'single', personId: p.personId })}
                  className="flex min-h-14 w-full items-center gap-3 rounded-lg py-1.5 text-left active:bg-[var(--tint)]"
                >
                  <Avatar name={p.name} size={36} tone={selected ? 'ink' : 'tint'} />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{personLabel(p)}</span>
                  {selected && <Check className="size-5 text-[var(--ink)]" strokeWidth={2.6} />}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        role="radio"
        aria-checked={multiple}
        onClick={() => onChange(multiple ? { mode: 'single', personId: ids[0] } : { mode: 'multiple', amounts: {} })}
        className="mt-1 flex min-h-12 items-center justify-between rounded-lg bg-[var(--tint)] px-3.5 text-left text-[15px] font-semibold"
      >
        Multiple people
        {multiple && <Check className="size-5 text-[var(--ink)]" strokeWidth={2.6} />}
      </button>
      {multiple && (
        <div className="py-3" aria-live="polite">
          <p className="tabular text-center text-[14px] font-semibold" data-testid="paid-summary">{preview.summary}</p>
          {preview.error && <p role="alert" className="mt-1 text-center text-[13px] font-medium text-[var(--negative)]">{preview.error}</p>}
        </div>
      )}
    </div>
  )
}

/** "Paid by you and split equally" sentence for the pill. */
export function paidSplitSentence(paid: PaidDraft, method: SplitMethod, participants: Participant[]): { paidBy: string; split: string } {
  const payer = paid.mode === 'single' ? participants.find((p) => p.personId === paid.personId) : null
  const paidBy = paid.mode === 'multiple' ? 'multiple people' : payer ? (payer.isMe ? 'you' : payer.name) : 'someone'
  const split = { equal: 'equally', exact: 'by amounts', percent: 'by percent', shares: 'by shares', adjustment: 'with adjustments' }[method]
  return { paidBy, split }
}
