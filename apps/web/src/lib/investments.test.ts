import { avatarMark, displayName, displayQuantity, displayTicker, formatMoney, splitDecimals, unitPrice } from './investments'

describe('investment display helpers', () => {
  it('names metals, stocks, crypto and funds the way people say them', () => {
    expect(displayName({ symbol: 'GC=F', name: 'Gold Dec 26', type: 'commodity' })).toBe('Gold')
    expect(displayName({ symbol: 'AAPL', name: 'Apple Inc.', type: 'stock' })).toBe('Apple')
    expect(displayName({ symbol: 'ASML.AS', name: 'ASML Holding N.V.', type: 'stock' })).toBe('ASML')
    expect(displayName({ symbol: 'BTC-EUR', name: 'Bitcoin EUR', type: 'crypto' })).toBe('Bitcoin')
    expect(displayName({ symbol: 'IDN000000001', name: 'Example Money Market Fund', type: 'mutual_fund' })).toBe('Example Money Market Fund')
  })

  it('hides exchange suffixes and fund ISINs', () => {
    expect(displayTicker({ symbol: 'ASML.AS', name: 'ASML', type: 'stock' })).toBe('ASML')
    expect(displayTicker({ symbol: 'BTC-EUR', name: 'Bitcoin', type: 'crypto' })).toBe('BTC')
    expect(displayTicker({ symbol: 'IDN000000001', name: 'Fund', type: 'mutual_fund' })).toBeNull()
  })

  it('builds short avatar marks', () => {
    expect(avatarMark({ symbol: 'GC=F', name: 'Gold', type: 'commodity' })).toBe('Au')
    expect(avatarMark({ symbol: 'QDVE.DE', name: 'iShares', type: 'etf' })).toBe('QDVE')
    expect(avatarMark({ symbol: 'IDN000000002', name: 'Example Bond Fund', type: 'mutual_fund' })).toBe('EB')
  })

  it('shows metals in grams and prices per gram', () => {
    expect(displayQuantity({ symbol: 'GC=F', name: 'Gold', type: 'commodity' }, 0.4822612)).toBe('15 g')
    expect(unitPrice({ symbol: 'GC=F', name: 'Gold', type: 'commodity' }, 3110.34768).price).toBeCloseTo(100)
    expect(displayQuantity({ symbol: 'BTC-EUR', name: 'Bitcoin', type: 'crypto' }, 0.001192)).toBe('0.001192 BTC')
    expect(displayQuantity({ symbol: 'AAPL', name: 'Apple', type: 'stock' }, 1)).toBe('1 share')
  })

  it('formats rupiah and euro amounts with signs and splits hero decimals', () => {
    expect(formatMoney(12345678.9, 'IDR')).toBe('Rp12,345,679')
    expect(formatMoney(-4250000, 'IDR', { compact: true })).toBe('−Rp4.3M')
    expect(formatMoney(42.5, 'EUR', { signed: true })).toBe('+€42.50')
    expect(splitDecimals('€1,204.35')).toEqual({ main: '€1,204', decimals: '.35' })
    expect(splitDecimals('Rp12,345,679')).toEqual({ main: 'Rp12,345,679', decimals: '' })
  })
})
