import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthState } from '@/lib/auth'

const auth: { state: AuthState } = { state: { status: 'unauthenticated' } }
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ state: auth.state, signOut: vi.fn(), refetch: vi.fn() }) }))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  getInvitePreview: vi.fn(),
  claimSplitInvite: vi.fn().mockResolvedValue({ data: { personId: 'p', mergedGuestId: 'g', expenses: 2 } }),
}))

import { claimSplitInvite, getInvitePreview } from '@/lib/api'
import { InvitePage } from './InvitePage'

const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345'

function renderAt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/invite/${TOKEN}`]}>
        <Routes>
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/shared" element={<p>Shared home</p>} />
          <Route path="/sign-up" element={<p>Sign up page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('InvitePage', () => {
  beforeEach(() => {
    vi.mocked(claimSplitInvite).mockClear()
    document.cookie = 'fos_invite=; Path=/; Max-Age=0'
  })

  it('signed out: previews the invite and remembers it before sign-up', async () => {
    auth.state = { status: 'unauthenticated' }
    vi.mocked(getInvitePreview).mockResolvedValue({ data: { status: 'valid', guestName: 'Sam', inviterName: 'Alex' } })
    const user = userEvent.setup()
    renderAt()
    expect(await screen.findByRole('heading', { name: 'Alex invited you to split expenses as Sam' })).toBeInTheDocument()
    const create = screen.getByRole('link', { name: 'Create account' })
    expect(create).toHaveAttribute('href', `/sign-up?next=${encodeURIComponent(`/invite/${TOKEN}`)}`)
    expect(screen.getByRole('link', { name: 'I already have an account' })).toHaveAttribute('href', `/sign-in?next=${encodeURIComponent(`/invite/${TOKEN}`)}`)
    await user.click(create)
    expect(document.cookie).toContain(`fos_invite=${TOKEN}`)
    expect(await screen.findByText('Sign up page')).toBeInTheDocument()
  })

  it('signed in: joins as the guest and lands on Shared', async () => {
    auth.state = { status: 'authenticated', user: { id: 'u', name: 'S', email: 's@x.test', emailVerified: true, image: null, createdAt: '' }, session: { id: 's', userId: 'u', expiresAt: '', ipAddress: null, userAgent: null } }
    vi.mocked(getInvitePreview).mockResolvedValue({ data: { status: 'valid', guestName: 'Sam', inviterName: 'Alex' } })
    const user = userEvent.setup()
    renderAt()
    await user.click(await screen.findByRole('button', { name: 'Join as Sam' }))
    await waitFor(() => expect(claimSplitInvite).toHaveBeenCalledWith(TOKEN))
    expect(await screen.findByText('Shared home')).toBeInTheDocument()
  })

  it.each([
    ['expired', 'This invite has expired'],
    ['claimed', 'This invite was already used'],
    ['revoked', 'This invite was replaced'],
  ] as const)('shows the %s state without a join button', async (status, title) => {
    auth.state = { status: 'unauthenticated' }
    vi.mocked(getInvitePreview).mockResolvedValue({ data: { status, guestName: 'Sam', inviterName: 'Alex' } })
    renderAt()
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Join as/ })).not.toBeInTheDocument()
  })

  it('explains a broken link', async () => {
    auth.state = { status: 'unauthenticated' }
    vi.mocked(getInvitePreview).mockRejectedValue(new Error('Invite not found'))
    renderAt()
    expect(await screen.findByRole('heading', { name: 'This invite link does not work' })).toBeInTheDocument()
    expect(screen.getByText(/Invite not found/)).toBeInTheDocument()
  })
})
