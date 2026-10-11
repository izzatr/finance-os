import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { claimSplitInvite, getInvitePreview } from '@/lib/api'
import { invalidateShared } from '@/hooks/use-split'
import { ErrorText, primaryButton, secondaryButton } from '@/components/shared/ui'

export const INVITE_COOKIE = 'fos_invite'

/** Lets the sign-up go through on instances with closed registration (the API checks this cookie). */
export function rememberInvite(token: string) {
  document.cookie = `${INVITE_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=3600; SameSite=Lax`
}

const STATUS_TEXT: Record<'expired' | 'claimed' | 'revoked', { title: string; body: string }> = {
  expired: { title: 'This invite has expired', body: 'Ask for a new link. Invites last 14 days.' },
  claimed: { title: 'This invite was already used', body: 'If that was you, sign in to see your shared expenses.' },
  revoked: { title: 'This invite was replaced', body: 'A newer link was created. Ask for the latest one.' },
}

/** Public: /invite/:token works signed out and signed in. */
export function InvitePage() {
  const { token = '' } = useParams()
  const { state } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const preview = useQuery({ queryKey: ['invite-preview', token], queryFn: () => getInvitePreview(token), retry: false })
  const claim = useMutation({
    mutationFn: () => claimSplitInvite(token),
    onSuccess: () => {
      invalidateShared(qc)
      document.cookie = `${INVITE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
      navigate('/shared')
    },
  })
  const next = encodeURIComponent(`/invite/${token}`)
  const data = preview.data?.data

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[var(--bg-base)] px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span aria-hidden className="flex size-10 items-center justify-center rounded-lg bg-[var(--ink)] text-[17px] font-bold text-[var(--cream)]">F</span>
          <span className="text-[16px] font-bold">Finance OS</span>
        </div>
        {preview.isLoading && <p className="text-[15px] text-[var(--text-tertiary)]">Loading invite…</p>}
        {preview.error && (
          <>
            <h1 className="text-[24px] font-bold leading-tight">This invite link does not work</h1>
            <p className="mt-2 text-[15px] text-[var(--text-secondary)]">{preview.error.message}. Check that you copied the whole link.</p>
          </>
        )}
        {data && data.status !== 'valid' && (
          <>
            <h1 className="text-[24px] font-bold leading-tight">{STATUS_TEXT[data.status].title}</h1>
            <p className="mt-2 text-[15px] text-[var(--text-secondary)]">{STATUS_TEXT[data.status].body}</p>
            <Link to={state.status === 'authenticated' ? '/shared' : '/sign-in'} className={`${secondaryButton} mt-6 w-full no-underline`}>
              {state.status === 'authenticated' ? 'Go to Shared' : 'Sign in'}
            </Link>
          </>
        )}
        {data && data.status === 'valid' && (
          <>
            <h1 className="text-[24px] font-bold leading-tight">{data.inviterName} invited you to split expenses as {data.guestName}</h1>
            <p className="mt-2 text-[15px] text-[var(--text-secondary)]">You keep every expense and balance you already share.</p>
            {state.status === 'loading' && <p className="mt-6 text-sm text-[var(--text-tertiary)]">Checking your session…</p>}
            {state.status === 'authenticated' && (
              <div className="mt-6 grid gap-2">
                <button type="button" className={primaryButton} disabled={claim.isPending} onClick={() => claim.mutate()}>
                  {claim.isPending ? 'Joining…' : `Join as ${data.guestName}`}
                </button>
                <ErrorText>{claim.error?.message}</ErrorText>
                <p className="text-[12.5px] text-[var(--text-tertiary)]">Signed in as {state.user.email}.</p>
              </div>
            )}
            {state.status === 'unauthenticated' && (
              <div className="mt-6 grid gap-2">
                <Link to={`/sign-up?next=${next}`} onClick={() => rememberInvite(token)} className={`${primaryButton} no-underline`}>Create account</Link>
                <Link to={`/sign-in?next=${next}`} onClick={() => rememberInvite(token)} className={`${secondaryButton} no-underline`}>I already have an account</Link>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
