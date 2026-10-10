import { describe, expect, it } from 'vitest'
import { currencyDecimals, groupAmountDisplay, pressKey, type KeypadKey } from './keypad'

const type = (keys: KeypadKey[], decimals = 2) => keys.reduce((acc, k) => pressKey(acc, k, decimals), '')

describe('pressKey', () => {
  it('builds a decimal amount', () => {
    expect(type(['4', '2', '.', '1', '8'])).toBe('42.18')
  })

  it('caps the fraction at the currency decimals', () => {
    expect(type(['1', '.', '2', '3', '4'])).toBe('1.23')
  })

  it('allows only one decimal point and prefixes a bare point with zero', () => {
    expect(type(['.', '5', '.'])).toBe('0.5')
  })

  it('drops leading zeros', () => {
    expect(type(['0', '0', '7'])).toBe('7')
  })

  it('backspaces', () => {
    expect(type(['1', '2', 'back'])).toBe('1')
    expect(pressKey('', 'back')).toBe('')
  })

  it('handles zero-decimal currencies with a 000 shortcut', () => {
    expect(type(['3', '5', '000'], 0)).toBe('35000')
    expect(type(['.', '5'], 0)).toBe('5')
    expect(type(['000'], 0)).toBe('')
  })

  it('caps the integer length', () => {
    expect(type(Array(20).fill('9') as KeypadKey[])).toHaveLength(12)
  })
})

describe('groupAmountDisplay', () => {
  it('groups thousands per currency while keeping the typed fraction', () => {
    expect(groupAmountDisplay('35000', 'IDR')).toBe('35.000')
    expect(groupAmountDisplay('1250.5', 'EUR')).toBe('1,250.5')
    expect(groupAmountDisplay('12.', 'EUR')).toBe('12.')
    expect(groupAmountDisplay('', 'EUR')).toBe('0')
  })
})

describe('currencyDecimals', () => {
  it('knows rupiah has no minor units', () => {
    expect(currencyDecimals('IDR')).toBe(0)
    expect(currencyDecimals('EUR')).toBe(2)
    expect(currencyDecimals(undefined)).toBe(2)
  })
})
