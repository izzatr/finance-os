import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUp, Loader2, RotateCcw, Sparkles } from 'lucide-react'
import { API_BASE_URL, getAiStatus, getInbox } from '@/lib/api'
import { useDefaultCurrency } from '@/contexts/CurrencyContext'
import { PageHeader } from '@/components/PageHeader'
import { ProposalCard } from '@/components/ProposalCard'

type ToolChip = { id: string; name: string; state: 'running' | 'ok' | 'error'; proposed: boolean; proposalId?: string; error?: string }
type ChatTurn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; tools: ToolChip[]; error?: string }

type StreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_start'; id: string; name: string }
  | { type: 'tool_result'; id: string; name: string; ok: boolean; proposed: boolean; proposalId?: string; error?: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

const STORAGE_KEY = 'finance-os-assistant-chat'

const SUGGESTIONS = [
  'How is this month going?',
  'Where did my money go last month?',
  'Coffee 4.50, card',
  'Who owes me money?',
]

// Tool calls stay out of the UI; these labels only tell the model, in later turns, what it drafted.
const TOOL_LABELS: Record<string, string> = {
  finance_add_transaction: 'Drafted a transaction',
  finance_transfer: 'Drafted a transfer',
  finance_reconcile: 'Drafted a balance fix',
}

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/^finance_/, '').replace(/_/g, ' ')
}

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function loadTurns(): ChatTurn[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ChatTurn[]) : []
  } catch {
    return []
  }
}

/** **bold** inside a line, as React nodes (no HTML injection). */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <b key={i} className="font-semibold">{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>,
  )
}

/** Just enough Markdown for chat answers: paragraphs, bullet and numbered lists, bold. */
export function Markdownish({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(
      <Tag key={blocks.length} className={`my-1 grid gap-0.5 pl-5 ${list.ordered ? 'list-decimal' : 'list-disc'}`}>
        {list.items.map((item, i) => <li key={i}>{inline(item)}</li>)}
      </Tag>,
    )
    list = null
  }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      const ordered = Boolean(numbered)
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] } }
      list.items.push((bullet ?? numbered)![1])
      continue
    }
    flush()
    if (line.trim() === '') continue
    blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ''))}</p>)
  }
  flush()
  return <div className="grid gap-1.5">{blocks}</div>
}

export function AssistantPage() {
  const qc = useQueryClient()
  const [currency] = useDefaultCurrency()
  const statusQuery = useQuery({ queryKey: ['ai-status'], queryFn: getAiStatus, staleTime: 5 * 60_000 })
  const inboxQuery = useQuery({ queryKey: ['inbox'], queryFn: getInbox })
  const [turns, setTurns] = useState<ChatTurn[]>(loadTurns)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const status = statusQuery.data?.data
  const proposals = new Map((inboxQuery.data?.data ?? []).map((p) => [p.id, p]))

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns.slice(-40)))
    } catch {
      // storage full or unavailable: the chat still works, it just won't survive a reload
    }
  }, [turns])

  async function send(text: string) {
    const content = text.trim()
    if (!content || busy) return
    setInput('')
    setBusy(true)

    const history = [...turns, { role: 'user' as const, text: content }]
    setTurns([...history, { role: 'assistant', text: '', tools: [] }])

    // The model only sees text, so carry over what earlier tool calls did (e.g. a drafted
    // transaction) or follow-ups like "make that 7 instead" have nothing to refer to.
    const messages = history.map((t) => {
      if (t.role === 'user') return { role: 'user', content: t.text }
      const notes = t.tools.filter((c) => c.proposed).map((c) => `[${toolLabel(c.name)}, waiting in Inbox]`)
      return { role: 'assistant', content: [t.text, ...notes].filter(Boolean).join('\n') || '(no reply)' }
    })

    const update = (fn: (turn: Extract<ChatTurn, { role: 'assistant' }>) => void) => {
      setTurns((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          const copy = { ...last, tools: last.tools.map((t) => ({ ...t })) }
          fn(copy)
          next[next.length - 1] = copy
        }
        return next
      })
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages, today: localToday(), currency }),
      })
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        update((turn) => { turn.error = res.status === 429 ? 'Too many messages in a minute. Wait a moment and try again.' : err?.error?.message ?? `Assistant unavailable (${res.status})` })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let sawProposal = false
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          let event: StreamEvent
          try {
            event = JSON.parse(line.slice(5)) as StreamEvent
          } catch {
            continue
          }
          if (event.type === 'text') {
            const delta = event.delta
            update((turn) => { turn.text += delta })
          } else if (event.type === 'tool_start') {
            const { id, name } = event
            update((turn) => { turn.tools.push({ id, name, state: 'running', proposed: false }) })
          } else if (event.type === 'tool_result') {
            const result = event
            if (result.proposed) sawProposal = true
            update((turn) => {
              const chip = turn.tools.find((t) => t.id === result.id)
              if (chip) Object.assign(chip, { state: result.ok ? 'ok' : 'error', proposed: result.proposed, proposalId: result.proposalId, error: result.error })
            })
          } else if (event.type === 'error') {
            const message = event.message
            update((turn) => { turn.error = message })
          }
        }
      }
      if (sawProposal) qc.invalidateQueries({ queryKey: ['inbox'] })
    } catch {
      update((turn) => { turn.error = 'Connection lost. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  if (statusQuery.isLoading) return null

  if (!status?.enabled) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 pb-8 pt-6 lg:px-8 lg:pt-10">
        <PageHeader title="Assistant" />
        <div className="rounded-2xl bg-[var(--tint)] px-6 py-8 text-center">
          <Sparkles className="mx-auto size-8 text-[var(--text-tertiary)]" />
          <p className="pt-3 text-[15px] font-semibold text-[var(--text-primary)]">Assistant not configured</p>
          <p className="pt-1 text-[14px] text-[var(--text-secondary)]">
            Set <code className="rounded bg-white px-1 py-0.5 text-[12px]">OPENROUTER_API_KEY</code> on the server to chat with your finances.
            Anything it records still waits in your Inbox.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex h-[calc(100dvh-6rem-env(safe-area-inset-bottom))] w-full max-w-2xl flex-col px-4 lg:h-dvh lg:px-8">
      <PageHeader
        title="Assistant"
        className="mb-0 pb-3 pt-6 lg:pt-10"
        action={turns.length > 0 ? (
          <button
            type="button"
            onClick={() => setTurns([])}
            disabled={busy}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-[var(--tint)] px-3.5 text-[14px] font-semibold disabled:opacity-50"
          >
            <RotateCcw className="size-4" /> New chat
          </button>
        ) : undefined}
      />

      <div ref={scrollRef} className="-mx-4 flex-1 overflow-y-auto px-4 pb-4" aria-live="polite">
        {turns.length === 0 && (
          <div className="pt-6">
            <p className="text-[15px] text-[var(--text-secondary)]">
              Ask about your money or tell it what you spent. It reads your live data, and anything it records waits in your Inbox until you approve it.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="h-10 rounded-full bg-[var(--tint)] px-4 text-[14px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--tint-strong)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 pt-2">
          {turns.map((turn, i) =>
            turn.role === 'user' ? (
              <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--ink)] px-4 py-2.5 text-[15px] text-white">
                {turn.text}
              </div>
            ) : (
              <div key={i} className="grid max-w-[94%] gap-2">
                {(turn.text || (busy && i === turns.length - 1 && !turn.error)) && (
                  <div className="rounded-2xl rounded-bl-md bg-white px-4 py-3 text-[15px] leading-relaxed text-[var(--text-primary)] ring-1 ring-[var(--border-subtle)]">
                    {turn.text ? <Markdownish text={turn.text} /> : <Loader2 className="size-4 animate-spin text-[var(--text-tertiary)]" />}
                  </div>
                )}
                {turn.tools.filter((t) => t.proposalId).map((t) => {
                  const p = proposals.get(t.proposalId!)
                  return p ? <ProposalCard key={t.id} proposal={p} compact /> : null
                })}
                {!(busy && i === turns.length - 1) && !turn.text && !turn.error && !turn.tools.some((t) => t.proposalId) && (
                  <p className="text-[13px] text-[var(--text-tertiary)]">No answer came back. Try asking again.</p>
                )}
                {turn.error && <p className="text-[13px] text-[var(--negative)]" role="alert">{turn.error}</p>}
              </div>
            ),
          )}
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void send(input) }} className="flex gap-2 pb-3 pt-2 lg:pb-6">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask, or say what you spent…"
          aria-label="Message"
          enterKeyHint="send"
          className="h-12 min-w-0 flex-1 rounded-2xl border border-[var(--border-medium)] bg-white px-4 text-[16px] outline-none focus-visible:border-[var(--ink)]"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send"
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--ink)] text-[var(--cream)] transition-transform active:scale-95 disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <ArrowUp className="size-5" strokeWidth={2.4} />}
        </button>
      </form>
    </main>
  )
}
