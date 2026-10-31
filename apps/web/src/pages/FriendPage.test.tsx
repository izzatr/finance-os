import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  getSplitFriend: vi.fn().mockResolvedValue({
    data: { personId: 'f1', name: 'Alex Example', isGuest: false, isFriend: true, canEdit: false, email: null, balances: [], breakdown: [] },
  }),
  removeSplitFriend: vi.fn().mockResolvedValue({}),
  createSplitInvite: vi.fn(),
  patchSplitFriend: vi.fn(),
}))
vi.mock('@/hooks/use-split', () => ({
  useSplitMe: () => ({ data: { data: { personId: 'me' } } }),
  invalidateShared: vi.fn(),
  splitKeys: { friend: (id: string) => ['split', 'friend', id] },
}))
vi.mock('@/components/shared/ExpenseFeed', () => ({ ExpenseFeed: () => <button type="button">Load older</button> }))
vi.mock('@/components/shared/ExpenseSheet', () => ({ ExpenseSheet: () => null }))
vi.mock('@/components/shared/SettleUpSheet', () => ({ SettleUpSheet: () => null }))

import { removeSplitFriend } from '@/lib/api'
import { FriendPage } from './FriendPage'

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/shared/friends/f1']}>
        <Routes>
          <Route path="/shared/friends/:friendId" element={<FriendPage />} />
          <Route path="/shared" element={<p>Shared home</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('FriendPage remove friend', () => {
  it('keeps Remove friend out of the feed and behind the header menu plus a confirmation', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Alex Example' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load older' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove friend/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'More options for Alex Example' }))
    fireEvent.click(await screen.findByRole('button', { name: /Remove friend/ }))
    expect(await screen.findByText('Remove Alex Example?')).toBeInTheDocument()
    expect(removeSplitFriend).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(removeSplitFriend).toHaveBeenCalledWith('f1'))
    expect(await screen.findByText('Shared home')).toBeInTheDocument()
  })
})
