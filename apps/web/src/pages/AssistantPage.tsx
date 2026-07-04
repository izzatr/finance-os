import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUp, Inbox, Loader2, Sparkles, Wrench } from 'lucide-react'
import { API_BASE_URL, getAiStatus } from '@/lib/api'

type ToolChip = { id: string; name: string; state: 'running' | 'ok' | 'error'; proposed: boolean }
type ChatTurn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; tools: ToolChip[]; error?: string }

type StreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_start'; id: string; name: string }
  | { type: 'tool_result'; id: string; name: string; ok: boolean; proposed: boolean }
  | { type: 'error'; message: string }
  | { type: 'done' }

const SUGGESTIONS = [
  'How much did I spend this month?',
  'What is my net worth in EUR?',
  'Log 12.50 groceries from my main wallet',
  'Who owes me money?',
]

function toolLabel(name: string): string {
  return name.replace(/^finance_/, '').replace(/_/g, ' ')
}

export function AssistantPage() {
  const qc = useQueryClient()
  const statusQuery = useQuery({ queryKey: ['ai-status'], queryFn: getAiStatus, staleTime: 5 * 60_000 })
  const [model, setModel] = useState<string>('')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const status = statusQuery.data?.data
  const activeModel = model || status?.defaultModel || ''
  const hasProposals = turns.some((t) => t.role === 'assistant' && t.tools.some((tool) => tool.proposed))

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [turns])

  async function send(text: string) {
    const content = text.trim()
    if (!content || busy) return
    setInput('')
    setBusy(true)

    const history = [...turns, { role: 'user' as const, text: content }]
    setTurns([...history, { role: 'assistant', text: '', tools: [] }])

    const payload = {
      model: activeModel || undefined,
      messages: history.map((t) => ({ role: t.role, content: t.text })),
    }

    const update = (fn: (turn: Extract<ChatTurn, { role: 'assistant' }>) => void) => {
      setTurns((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          const copy = { ...last, tools: [...last.tools] }
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
        body: JSON.stringify(payload),
      })
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        update((turn) => { turn.error = err?.error?.message ?? `Assistant unavailable (${res.status})` })
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
            update((turn) => { turn.text += (event as { delta: string }).delta })
          } else if (event.type === 'tool_start') {
            update((turn) => { turn.tools.push({ id: event.id, name: event.name, state: 'running', proposed: false }) })
          } else if (event.type === 'tool_result') {
            if (event.proposed) sawProposal = true
            update((turn) => {
              const chip = turn.tools.find((t) => t.id === event.id)
              if (chip) {
                chip.state = event.ok ? 'ok' : 'error'
                chip.proposed = event.proposed
              }
            })
          } else if (event.type === 'error') {
            update((turn) => { turn.error = (event as { message: string }).message })
          }
        }
      }

      if (sawProposal) {
        qc.invalidateQueries({ queryKey: ['inbox'] })
      }
    } catch {
      update((turn) => { turn.error = 'Connection lost — try again.' })
    } finally {
      setBusy(false)
    }
  }

  if (statusQuery.isLoading) return null

  if (!status?.enabled) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:px-8">
        <div className="rounded-xl bg-white p-8 text-center shadow-[var(--shadow-card)]">
          <Sparkles className="mx-auto size-8 text-[var(--text-tertiary)]" />
          <p className="pt-3 text-sm font-medium text-[var(--text-primary)]">Assistant not configured</p>
          <p className="pt-1 text-xs text-[var(--text-tertiary)]">
            Set <code className="font-mono">OPENROUTER_API_KEY</code> on the server to chat with your finances.
            Everything the assistant wants to book still goes through your approval inbox.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-2xl flex-col px-4 lg:h-dvh lg:px-8">
      <header className="flex items-center justify-between py-4">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Assistant</h1>
        <select
          value={activeModel}
          onChange={(e) => setModel(e.target.value)}
          aria-label="Model"
          className="h-8 max-w-44 truncate rounded-md border border-input bg-transparent px-2 text-xs text-[var(--text-secondary)]"
        >
          {(status.models ?? []).map((m) => (
            <option key={m} value={m}>{m.split('/').pop()}</option>
          ))}
        </select>
      </header>

      {hasProposals && (
        <Link
          to="/inbox"
          className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--accent-blue)]/30 bg-[var(--accent-dim)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] no-underline"
        >
          <Inbox className="size-4 text-[var(--accent-blue)]" />
          The assistant filed proposals — review them in your inbox
        </Link>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-4" aria-live="polite">
        {turns.length === 0 && (
          <div className="grid gap-2 pt-8">
            <p className="pb-2 text-center text-sm text-[var(--text-tertiary)]">
              Ask about your money — the assistant reads live data and proposes changes for your approval.
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-xl border border-[var(--border-medium)] bg-white px-4 py-2.5 text-left text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-blue)]"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-3">
          {turns.map((turn, i) =>
            turn.role === 'user' ? (
              <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[var(--accent-blue)] px-4 py-2.5 text-sm text-white">
                {turn.text}
              </div>
            ) : (
              <div key={i} className="max-w-[92%]">
                {turn.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pb-1.5">
                    {turn.tools.map((tool) => (
                      <span
                        key={tool.id}
                        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          tool.state === 'error'
                            ? 'bg-[color-mix(in_srgb,var(--negative)_12%,white)] text-[var(--negative)]'
                            : tool.proposed
                              ? 'bg-[var(--accent-dim)] text-[var(--accent-blue)]'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {tool.state === 'running' ? <Loader2 className="size-3 animate-spin" /> : <Wrench className="size-3" />}
                        {toolLabel(tool.name)}
                        {tool.proposed && ' → inbox'}
                      </span>
                    ))}
                  </div>
                )}
                {(turn.text || (!busy && !turn.error)) && (
                  <div className="rounded-2xl rounded-bl-md bg-white px-4 py-2.5 text-sm text-[var(--text-primary)] shadow-[var(--shadow-card)] whitespace-pre-wrap">
                    {turn.text || '…'}
                  </div>
                )}
                {turn.error && (
                  <p className="pt-1 text-xs text-[var(--negative)]" role="alert">{turn.error}</p>
                )}
              </div>
            ),
          )}
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); void send(input) }}
        className="sticky bottom-20 flex gap-2 pb-4 lg:bottom-0"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your money…"
          aria-label="Message"
          className="h-11 flex-1 rounded-full border border-[var(--border-medium)] bg-white px-4 text-sm outline-none focus-visible:border-[var(--accent-blue)]"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send"
          className="flex size-11 items-center justify-center rounded-full bg-[var(--accent-blue)] text-white transition-transform active:scale-95 disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <ArrowUp className="size-5" />}
        </button>
      </form>
    </div>
  )
}
