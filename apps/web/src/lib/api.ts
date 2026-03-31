const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.error?.message ?? `Request failed with status ${response.status}`)
  }

  return response.json() as Promise<T>
}

export type DashboardResponse = {
  data: {
    walletCount: number
    assetCount: number
    transactionCount: number
    importCount: number
  }
}

export type Wallet = {
  id: string
  name: string
  walletType: string
  institution?: string | null
  assetId: string
  isActive: boolean
  balance: number
  currency: string
}

export type Transaction = {
  id: string
  transactionDate: string
  type: string
  description: string
  notes?: string | null
  externalRef?: string | null
  entries: Array<{
    walletId: string
    assetId: string
    amount: string
    notes?: string | null
  }>
}

export type RecentTransaction = {
  id: string
  transactionDate: string
  type: string
  description: string
  notes: string | null
  categoryName: string | null
  amount: number
  currency: string
  walletName: string
}

export type SummaryResponse = {
  data: {
    totalIncome: number
    totalExpense: number
    totalTransfers: number
    net: number
    transactionCount: number
    walletCount: number
    categoryCount: number
    dateRange: {
      from: string | null
      to: string | null
    }
    byCurrency: Array<{
      currency: string
      income: number
      expense: number
      transfer: number
      adjustment: number
      fee: number
      net: number
    }>
  }
}

export type CategoryBreakdown = {
  categoryId: string | null
  categoryName: string | null
  categorySlug: string | null
  total: number
  count: number
  type: string
  currency: string
}

export function getDashboard() {
  return request<DashboardResponse>('/api/dashboard')
}

export type Asset = {
  id: string
  code: string
  name: string
  type: string
  precision: number
}

export function getAssets() {
  return request<{ data: Asset[] }>('/api/assets')
}

export function createWallet(body: {
  name: string
  walletType: string
  assetId: string
  institution?: string
  isActive?: boolean
}) {
  return request<{ data: Wallet }>('/api/wallets', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function getWallets() {
  return request<{ data: Wallet[] }>('/api/wallets')
}

export function createTransaction(body: {
  transactionDate: string
  type: string
  description: string
  notes?: string
  entries: Array<{ walletId: string; assetId: string; amount: string }>
}) {
  return request<{ data: Transaction }>('/api/transactions', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function getTransactions() {
  return request<{ data: Transaction[] }>('/api/transactions')
}

export function getRecentTransactions() {
  return request<{ data: RecentTransaction[] }>('/api/analytics/recent')
}

export function getSummary(params?: { from?: string; to?: string }) {
  const searchParams = new URLSearchParams()
  if (params?.from) searchParams.set('from', params.from)
  if (params?.to) searchParams.set('to', params.to)
  const qs = searchParams.toString()
  return request<SummaryResponse>(`/api/analytics/summary${qs ? `?${qs}` : ''}`)
}

export type Category = { id: string; name: string; slug: string }

export function getCategories() {
  return request<{ data: Category[] }>('/api/categories')
}

export function getCategoryBreakdown(params?: { from?: string; to?: string }) {
  const searchParams = new URLSearchParams()
  if (params?.from) searchParams.set('from', params.from)
  if (params?.to) searchParams.set('to', params.to)
  const qs = searchParams.toString()
  return request<{ data: CategoryBreakdown[] }>(`/api/analytics/category-breakdown${qs ? `?${qs}` : ''}`)
}

export type MonthlyTrend = {
  month: string
  income: number
  expense: number
  net: number
  currency: string
}

export type WalletTransaction = {
  id: string
  transactionDate: string
  type: string
  description: string
  notes: string | null
  categoryName: string | null
  amount: number
  currency: string
}

export type WalletDetail = {
  wallet: Wallet & { currency: string; balance: number }
  transactions: WalletTransaction[]
}

export type AssetGrowth = {
  month: string
  currency: string
  balance: number
}

export function getAssetGrowth(params?: { from?: string; to?: string }) {
  const searchParams = new URLSearchParams()
  if (params?.from) searchParams.set('from', params.from)
  if (params?.to) searchParams.set('to', params.to)
  const qs = searchParams.toString()
  return request<{ data: AssetGrowth[] }>(`/api/analytics/asset-growth${qs ? `?${qs}` : ''}`)
}

export function getMonthlyTrend(params?: { from?: string; to?: string }) {
  const searchParams = new URLSearchParams()
  if (params?.from) searchParams.set('from', params.from)
  if (params?.to) searchParams.set('to', params.to)
  const qs = searchParams.toString()
  return request<{ data: MonthlyTrend[] }>(`/api/analytics/monthly-trend${qs ? `?${qs}` : ''}`)
}

export function getWalletTransactions(walletId: string) {
  return request<{ data: WalletDetail }>(`/api/wallets/${walletId}/transactions`)
}

export function patchTransactionNotes(id: string, notes: string | null) {
  return request<{ data: { id: string; notes: string | null } }>(`/api/transactions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ notes }),
  })
}

export function createTransfer(payload: {
  sourceWalletId: string
  targetWalletId: string
  assetId: string
  amount: string
  description: string
  transactionDate: string
}) {
  return request<{ data: Transaction }>('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      transactionDate: payload.transactionDate,
      type: 'transfer',
      description: payload.description,
      entries: [
        { walletId: payload.sourceWalletId, assetId: payload.assetId, amount: `-${payload.amount}` },
        { walletId: payload.targetWalletId, assetId: payload.assetId, amount: payload.amount },
      ],
    }),
  })
}

export function patchWallet(id: string, body: {
  name?: string
  walletType?: string
  institution?: string | null
  isActive?: boolean
}) {
  return request<{ data: Wallet }>(`/api/wallets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function patchTransaction(id: string, body: {
  description?: string
  type?: string
  transactionDate?: string
  notes?: string | null
  categoryId?: string | null
  amount?: string
}) {
  return request<{ data: unknown }>(`/api/transactions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export type ExchangeRates = {
  base: string
  rates: Record<string, number>
}

export async function getExchangeRates(): Promise<ExchangeRates> {
  const res = await fetch('https://open.er-api.com/v6/latest/EUR')
  if (!res.ok) throw new Error('Failed to fetch exchange rates')
  const data = await res.json()
  return { base: 'EUR', rates: data.rates }
}

export function searchTransactions(q: string) {
  return request<{ data: RecentTransaction[] }>(`/api/transactions/search?q=${encodeURIComponent(q)}`)
}
