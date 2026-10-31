import type { InstrumentType } from '@/lib/investments'

export type InvestmentHolding = {
  id: string
  listingId: string
  symbol: string
  name: string
  type?: InstrumentType
  exchange: string
  quoteCurrency: string
  quantity: number
  averageCost: number | null
  averageCostCurrency: string | null
  price: number | null
  baseValue: number | null
  costBaseValue: number | null
  unrealizedBase: number | null
  unrealizedPercent: number | null
  dailyChangePercent: number | null
  priceStatus: 'fresh' | 'stale' | 'error' | 'missing'
  priceError: string | null
}
