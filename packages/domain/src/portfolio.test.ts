import { describe, expect, it } from 'vitest'
import { holdingCreateSchema, holdingPatchSchema, marketSearchQuerySchema } from './portfolio'

describe('portfolio domain schemas', () => {
  it('accepts international Yahoo listing metadata and decimal holding values', () => {
    expect(holdingCreateSchema.parse({ walletId: '1f7b4c56-b39d-44ef-9cf1-23925851cd4e', providerSymbol: '7203.T', name: 'Toyota Motor Corporation', instrumentType: 'stock', exchangeCode: 'JPX', exchangeName: 'Tokyo', currency: 'JPY', timezone: 'Asia/Tokyo', quantity: '10.5', averageCost: '2500', costCurrency: 'JPY' })).toMatchObject({ provider: 'yahoo', providerSymbol: '7203.T' })
  })

  it('rejects zero/negative quantities, unsupported providers, and empty patches', () => {
    const base = { walletId: '1f7b4c56-b39d-44ef-9cf1-23925851cd4e', providerSymbol: 'VWCE.DE', name: 'Vanguard FTSE All-World UCITS ETF', instrumentType: 'etf', exchangeCode: 'GER', exchangeName: 'XETRA', currency: 'EUR', timezone: 'Europe/Berlin' }
    expect(() => holdingCreateSchema.parse({ ...base, quantity: '0' })).toThrow()
    expect(() => holdingCreateSchema.parse({ ...base, quantity: '1e309' })).toThrow()
    expect(() => holdingCreateSchema.parse({ ...base, quantity: '123456789012345678901' })).toThrow()
    expect(() => holdingCreateSchema.parse({ ...base, quantity: '1.123456789' })).toThrow()
    expect(() => holdingCreateSchema.parse({ ...base, quantity: '1', provider: 'other' })).toThrow()
    expect(() => holdingPatchSchema.parse({})).toThrow()
  })

  it('bounds provider search queries', () => {
    expect(marketSearchQuerySchema.parse({ q: ' BBCA ', limit: '25' })).toEqual({ q: 'BBCA', limit: 25 })
    expect(() => marketSearchQuerySchema.parse({ q: 'x', limit: 26 })).toThrow()
  })
})
