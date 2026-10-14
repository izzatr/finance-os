import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { SharedExpense } from '@/lib/api'

const ME = 'p-me'
const base = (over: Partial<SharedExpense>): SharedExpense => ({
  id: 'e', groupId: null, groupName: null, kind: 'expense', description: 'x', cost: '10.00', currency: 'EUR', date: '2026-10-13T12:00:00.000Z',
  category: 'general', notes: null, splitMethod: 'equal', splitInput: null, paidInput: null, repeatInterval: 'monthly', nextRepeatAt: null,
  shares: [{ personId: 'p-1', name: 'Taylor', isGuest: true, paid: '10.00', owed: '5.00' }, { personId: ME, name: 'Me', isGuest: false, paid: '0.00', owed: '5.00' }],
  createdBy: { personId: ME, name: 'Me' }, updatedBy: null, createdAt: '', updatedAt: '', deletedAt: null, version: 1, me: null, myBooks: null,
  ...over,
} as SharedExpense)

const getSharedExpenses = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), getSharedExpenses }))

import { RepeatingExpenses } from './RepeatingExpenses'

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter><RepeatingExpenses mePersonId={ME} /></MemoryRouter></QueryClientProvider>)
}

describe('RepeatingExpenses', () => {
  it('lists repeating expenses soonest first behind a disclosure', async () => {
    getSharedExpenses.mockResolvedValue({ next: null, data: [
      base({ id: 'a', description: 'Water bill', repeatInterval: 'quarterly', nextRepeatAt: '2027-01-13T12:00:00.000Z' }),
      base({ id: 'b', description: 'Phone plan', repeatInterval: 'monthly', nextRepeatAt: '2026-11-02T12:00:00.000Z' }),
    ] })
    const user = userEvent.setup()
    renderIt()
    const toggle = await screen.findByRole('button', { name: /Repeating · 2/ })
    expect(getSharedExpenses).toHaveBeenCalledWith({ repeating: true, limit: 100 })
    expect(screen.queryByText('Phone plan')).toBeNull()
    await user.click(toggle)
    const rows = within(screen.getByRole('region', { name: 'Repeating expenses' })).getAllByRole('link')
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/Phone plan.*Every month · Taylor paid.*next.*2 Nov/),
      expect.stringMatching(/Water bill.*Every 3 months.*next.*13 Jan/),
    ])
    expect(rows[0]).toHaveAttribute('href', '/shared/expenses/b')
  })

  it('renders nothing when nothing repeats', async () => {
    getSharedExpenses.mockResolvedValue({ next: null, data: [] })
    const { container } = renderIt()
    await vi.waitFor(() => expect(getSharedExpenses).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
