import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { deleteWallet } from '../lib/api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Props = {
  walletId: string
  walletName: string
  onClose: () => void
}

export function DeleteWalletDialog({ walletId, walletName, onClose }: Props) {
  const qc = useQueryClient()
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: () => deleteWallet(walletId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallets'] })
      qc.invalidateQueries({ queryKey: ['summary'] })
      navigate('/wallets')
    },
  })

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete wallet?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{walletName}</span> will be removed from
            your wallets. This is a soft delete &mdash; it can be restored later.
          </DialogDescription>
        </DialogHeader>

        {mutation.error && (
          <p className="font-mono text-xs text-[var(--negative)]">{mutation.error.message}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
