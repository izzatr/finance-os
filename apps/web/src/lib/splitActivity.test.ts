import { describe, expect, it } from 'vitest'
import type { RecentTransaction, SplitActivity } from './api'
import { activitySentence } from './splitActivity'
import { collapseSharedRows } from './sharedRows'
import { safeNext } from './nextPath'

const base: SplitActivity = { id: '1', kind: 'expense.created', actorPersonId: 'p', actorName: 'Ana', groupId: 'g', groupName: 'Flat', expenseId: 'e', data: { description: 'Rent', cost: '1400.00', currency: 'EUR' }, createdAt: new Date().toISOString(), isMine: false, unread: true }

describe('activity sentences', () => {
  it('reads like a person wrote it', () => {
    expect(activitySentence(base)).toBe('Ana added "Rent" in Flat')
    expect(activitySentence({ ...base, isMine: true, kind: 'payment.created' })).toBe('You recorded a payment of €1,400.00 in Flat')
    expect(activitySentence({ ...base, kind: 'group.updated', data: { name: 'Home', previousName: 'Flat' } })).toBe('Ana renamed "Flat" to "Home"')
    expect(activitySentence({ ...base, kind: 'group.updated', data: { name: 'Flat', previousName: 'Flat', simplifyDebts: false } })).toBe('Ana turned off simplify debts in "Flat"')
    expect(activitySentence({ ...base, kind: 'comment.added', data: { description: 'Rent', comment: 'paid late' } })).toBe('Ana commented on "Rent": "paid late"')
    expect(activitySentence({ ...base, kind: 'person.joined', groupId: null, groupName: null, data: { name: 'Sam Lee', guestName: 'Sam' } })).toBe('Sam Lee joined (was Sam)')
    expect(activitySentence({ ...base, kind: 'group.left', data: { name: 'Ana' } })).toBe('Ana left "Flat"')
    for (const kind of ['expense.updated', 'expense.deleted', 'expense.restored', 'expense.repeated', 'payment.updated', 'payment.deleted', 'payment.restored', 'group.created', 'group.deleted', 'group.restored', 'group.member_added', 'group.member_removed', 'friend.added']) {
      expect(activitySentence({ ...base, kind })).not.toMatch(/made a change|\u2014/)
    }
  })
})

describe('collapseSharedRows', () => {
  const row = (over: Partial<RecentTransaction>): RecentTransaction => ({ id: 't1', entryId: 'e1', transactionDate: '2026-10-09T12:00:00Z', type: 'expense', description: 'Dinner', notes: null, categoryName: null, amount: 0, currency: 'EUR', walletName: 'Bank', ...over })

  it('merges the two legs of a shared expense into my share', () => {
    const rows = collapseSharedRows([
      row({ entryId: 'e1', amount: -30, walletName: 'Bank', sharedExpenseId: 'x', friendsWallet: false }),
      row({ entryId: 'e2', amount: 20, walletName: 'Friends · EUR', sharedExpenseId: 'x', friendsWallet: true }),
      row({ id: 't2', entryId: 'e3', amount: -5, description: 'Coffee' }),
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ amount: -10, walletName: 'Shared · Bank', sharedExpenseId: 'x' })
    expect(rows[1]).toMatchObject({ id: 'e3', amount: -5 })
  })
})

describe('safeNext', () => {
  it('only allows same-site paths', () => {
    expect(safeNext('?next=%2Finvite%2Fabc')).toBe('/invite/abc')
    expect(safeNext('?next=https://evil.test')).toBeNull()
    expect(safeNext('?next=//evil.test')).toBeNull()
  })
})
