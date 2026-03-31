import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Check, X } from 'lucide-react'
import { patchTransactionNotes } from '../lib/api'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

type Props = {
  transactionId: string
  walletId: string
  initialNotes: string | null
}

export function EditNotesInline({ transactionId, walletId, initialNotes }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialNotes ?? '')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => patchTransactionNotes(transactionId, draft || null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet-transactions', walletId] })
      qc.invalidateQueries({ queryKey: ['recent'] })
      setEditing(false)
    },
  })

  if (!editing) {
    return (
      <button
        className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-primary"
        onClick={() => { setDraft(initialNotes ?? ''); setEditing(true) }}
      >
        {initialNotes ? (
          <span className="text-[var(--text-secondary)]">{initialNotes}</span>
        ) : (
          <span className="italic">Add note...</span>
        )}
        <Pencil size={12} strokeWidth={1.5} />
      </button>
    )
  }

  return (
    <div className="mt-1 flex flex-col gap-1">
      <Textarea
        className="min-h-12 font-mono text-xs"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add a note..."
        rows={2}
        autoFocus
      />
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="hover:border-[var(--positive)] hover:text-[var(--positive)]"
        >
          <Check size={14} />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setEditing(false)}
          className="hover:border-[var(--negative)] hover:text-[var(--negative)]"
        >
          <X size={14} />
        </Button>
      </div>
      {mutation.error && <span className="font-mono text-xs text-[var(--negative)]">{mutation.error.message}</span>}
    </div>
  )
}
