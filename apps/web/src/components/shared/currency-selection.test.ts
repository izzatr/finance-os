import { describe, expect, it } from 'vitest'
import { currencyDropdown } from './ExpenseSheet'
import { buildPaymentPayload } from './SettleUpSheet'
import { buildExpensePayload, newExpenseDraft } from '@/lib/expenseDraft'

describe('supported shared currencies', () => {
  it('does not offer arbitrary currency codes passed as defaults', () => {
    const options = currencyDropdown(['XYZ', 'USD', 'JPY'])
    expect(options.some((o) => o.value === 'XYZ')).toBe(false)
    expect(options.some((o) => o.value === 'USD')).toBe(true)
  })
  it('rejects unsupported shared expenses before sending', () => {
    const draft = { ...newExpenseDraft({ mePersonId: 'me', currency: 'XYZ', date: '2026-10-12', participants: ['me', 'friend'] }), cost: '20', description: 'Lunch' }
    expect(buildExpensePayload(draft, ['me', 'friend'], 'me', [])).toEqual({ ok: false, error: 'Pick a supported currency' })
  })
  it('rejects unsupported walletless settlements before sending', () => {
    expect(buildPaymentPayload({ fromPersonId: 'friend', toPersonId: 'me', amount: '10', currency: 'XYZ', date: '2026-10-12', groupId: null, walletId: null, fundingAmount: '' }, 'me', null)).toEqual({ error: 'Pick a supported currency' })
  })
  it.each([['JPY', '20'], ['IDR', '20000'], ['USD', '20.25']])('allows walletless %s settlement', (currency, amount) => {
    const result = buildPaymentPayload({ fromPersonId: 'friend', toPersonId: 'me', amount, currency, date: '2026-10-12', groupId: null, walletId: null, fundingAmount: '' }, 'me', null)
    expect(result).toMatchObject({ body: { currency, cost: amount, myBooks: { fundingWalletId: null, fundingAmount: null } } })
  })
})
