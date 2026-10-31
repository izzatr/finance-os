import { describe, expect, it } from 'vitest'
import { balanceSummary, biggestBalance, buildPaymentPayload } from './SettleUpSheet'

const balances = [
  { currency: 'IDR', amount: '-1500000.00' },
  { currency: 'AUD', amount: '-168.40' },
  { currency: 'EUR', amount: '12.00' },
]
// EUR-based rates: 1 EUR = 18000 IDR, 1.7 AUD
const rates = { EUR: 1, IDR: 18000, AUD: 1.7 }

describe('settle up helpers', () => {
  it('preselects the biggest balance by value in the default currency', () => {
    expect(biggestBalance(balances, { defaultCurrency: 'EUR', rates })?.currency).toBe('AUD')
    expect(biggestBalance(balances, { defaultCurrency: 'EUR', rates: null })?.currency).toBe('EUR')
    expect(biggestBalance(balances, { defaultCurrency: 'USD', rates: null })?.currency).toBe('IDR')
    expect(biggestBalance(balances, { preferred: 'IDR', defaultCurrency: 'EUR', rates })?.currency).toBe('IDR')
  })

  it('summarises several balances in one short line', () => {
    expect(balanceSummary(balances, 'EUR')).toBe('owes you €12.00 +2')
    expect(balanceSummary(balances.slice(0, 2), 'EUR')).toBe('you owe in 2 currencies')
    expect(balanceSummary([], 'EUR')).toBe('settled up')
    expect(balanceSummary(balances.slice(0, 2), 'EUR', { currency: 'EUR', net: '-253.59' })).toBe('you owe ≈€253.59 in 2 currencies')
  })

  it('builds a payment body with my books', () => {
    const res = buildPaymentPayload({ fromPersonId: 'b', toPersonId: 'me', amount: '20', currency: 'EUR', date: '2026-10-04', groupId: null, walletId: 'w', fundingAmount: '' }, 'me', 'EUR')
    expect(res).toEqual({ body: { kind: 'payment', groupId: null, cost: '20', currency: 'EUR', date: '2026-10-04T12:00:00.000Z', payment: { fromPersonId: 'b', toPersonId: 'me' }, myBooks: { fundingWalletId: 'w', fundingAmount: null } } })
    expect(buildPaymentPayload({ fromPersonId: 'b', toPersonId: 'me', amount: '1.5', currency: 'JPY', date: '2026-10-04', groupId: null, walletId: null, fundingAmount: '' }, 'me', null)).toEqual({ error: '1.5: this currency has no decimals' })
  })
})
