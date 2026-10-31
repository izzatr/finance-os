import { describe, expect, it } from 'vitest'
import { currencyPickerOptions, isSupportedCurrency, rateBetween, SUPPORTED_CURRENCY_CODES } from './currencies'

describe('currency catalog', () => {
  it('matches the backend catalog: ISO codes only, no units of account', () => {
    expect(isSupportedCurrency('EUR')).toBe(true)
    expect(isSupportedCurrency('NOK')).toBe(true)
    for (const bad of ['XDR', 'XSU', 'ZZZ', 'eur', 'XAU_G', '']) expect(isSupportedCurrency(bad)).toBe(false)
    expect(SUPPORTED_CURRENCY_CODES.length).toBeGreaterThan(100)
  })
})

describe('currencyPickerOptions', () => {
  it('puts the default and preferred currencies first in order, then the rest A-Z', () => {
    const options = currencyPickerOptions(['IDR', 'USD', 'JPY'])
    expect(options.slice(0, 3).map((o) => o.value)).toEqual(['IDR', 'USD', 'JPY'])
    expect(options.slice(0, 3).every((o) => o.group === 'Your currencies')).toBe(true)
    const rest = options.slice(3)
    expect(rest.every((o) => o.group === 'All currencies')).toBe(true)
    expect(rest.map((o) => o.value)).toEqual([...rest.map((o) => o.value)].sort())
    expect(rest.some((o) => ['IDR', 'USD', 'JPY'].includes(o.value))).toBe(false)
    // The remaining catalogue stays reachable by code or English name.
    expect(rest.find((o) => o.value === 'NOK')?.keywords?.join(' ')).toMatch(/krone/i)
  })

  it('collapses duplicates and drops unsupported codes', () => {
    const options = currencyPickerOptions(['USD', 'XYZ', 'USD', 'XDR', 'EUR'])
    expect(options.slice(0, 2).map((o) => o.value)).toEqual(['USD', 'EUR'])
    expect(options.filter((o) => o.value === 'USD')).toHaveLength(1)
    expect(options.some((o) => o.value === 'XYZ' || o.value === 'XDR')).toBe(false)
  })

  it('has no group headings when nothing is pinned', () => {
    expect(currencyPickerOptions([]).every((o) => o.group === undefined)).toBe(true)
  })
})

describe('rateBetween', () => {
  const rates = { EUR: 1, USD: 1.25, IDR: 20000 }
  it('converts through EUR-based rates', () => {
    expect(rateBetween(rates, 'EUR', 'USD')).toBeCloseTo(1.25)
    expect(rateBetween(rates, 'USD', 'EUR')).toBeCloseTo(0.8)
    expect(rateBetween(rates, 'USD', 'IDR')).toBeCloseTo(16000)
    expect(rateBetween(rates, 'USD', 'USD')).toBe(1)
  })
  it('returns null, never 1, when a rate is missing', () => {
    expect(rateBetween(rates, 'NOK', 'EUR')).toBeNull()
    expect(rateBetween(rates, 'EUR', 'NOK')).toBeNull()
    expect(rateBetween(rates, 'NOK', 'SEK')).toBeNull()
    expect(rateBetween(undefined, 'EUR', 'USD')).toBeNull()
    expect(rateBetween({ ...rates, NOK: 0 }, 'EUR', 'NOK')).toBeNull()
    expect(rateBetween({ ...rates, NOK: Number.NaN }, 'EUR', 'NOK')).toBeNull()
  })
})
