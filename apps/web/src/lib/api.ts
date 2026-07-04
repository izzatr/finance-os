const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const target = `${API_BASE_URL}${path}`
  const response = await fetch(target, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  const contentType = response.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')

  if (!response.ok) {
    const payload = isJson ? await response.json().catch(() => null) : null
    throw new Error(payload?.error?.message ?? payload?.message ?? `Request failed with status ${response.status}`)
  }

  if (!isJson) {
    throw new Error(`Expected JSON response from ${target}`)
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

export type WalletValuation = {
  quantity: number
  price: number
  currency: string
  value: number
  asOf: string
} | null

export type Wallet = {
  id: string
  name: string
  walletType: string
  institution?: string | null
  assetId: string
  isActive: boolean
  balance: number
  currency: string
  unit?: string | null
  valuation?: WalletValuation
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
  categoryId?: string
  entries: Array<{ walletId: string; assetId: string; amount: string }>
  splits?: Array<{ personId: string; assetId?: string; amount: string }>
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

export function getRecentTransactionsPage(params: { limit?: number; before?: string }) {
  const searchParams = new URLSearchParams()
  if (params.limit) searchParams.set('limit', String(params.limit))
  if (params.before) searchParams.set('before', params.before)
  return request<{ data: RecentTransaction[] }>(`/api/analytics/recent?${searchParams}`)
}

export function getSummary(params?: { from?: string; to?: string }) {
  const searchParams = new URLSearchParams()
  if (params?.from) searchParams.set('from', params.from)
  if (params?.to) searchParams.set('to', params.to)
  const qs = searchParams.toString()
  return request<SummaryResponse>(`/api/analytics/summary${qs ? `?${qs}` : ''}`)
}

export type CategoryType = 'income' | 'expense' | 'transfer'

export type Category = {
  id: string
  name: string
  slug: string
  type: CategoryType
  parentId: string | null
  needsReview: boolean
}

export function getCategories() {
  return request<{ data: Category[] }>('/api/categories')
}

export function createCategory(body: { name: string; type?: CategoryType; parentId?: string }) {
  return request<{ data: Category }>('/api/categories', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function patchCategory(id: string, body: { name?: string; type?: CategoryType; parentId?: string | null }) {
  return request<{ data: Category }>(`/api/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
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
  createdAt: string
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

export function deleteWallet(id: string) {
  return request<{ data: { id: string; deletedAt: string } }>(`/api/wallets/${id}`, {
    method: 'DELETE',
  })
}

export function deleteTransaction(id: string) {
  return request<{ data: { id: string; deletedAt: string } }>(`/api/transactions/${id}`, {
    method: 'DELETE',
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

type ExchangeRateRow = { base: string; quote: string; rate: number; asOf: string }

/** Latest EUR-based rates from our own API (fed by the daily ECB job). */
export async function getExchangeRates(): Promise<ExchangeRates> {
  const { data } = await request<{ data: ExchangeRateRow[] }>('/api/exchange-rates')
  const rates: Record<string, number> = { EUR: 1 }
  for (const row of data) {
    if (row.base === 'EUR') rates[row.quote] = row.rate
  }
  return { base: 'EUR', rates }
}

export function searchTransactions(q: string) {
  return request<{ data: RecentTransaction[] }>(`/api/transactions/search?q=${encodeURIComponent(q)}`)
}

// ── People & shared expenses ─────────────────────────────────────────────

export type Person = {
  id: string
  name: string
  email: string | null
  notes: string | null
}

export type PersonBalance = { assetCode: string; amount: number }

export function getPeople() {
  return request<{ data: Person[] }>('/api/people')
}

export function createPerson(body: { name: string; email?: string; notes?: string }) {
  return request<{ data: Person }>('/api/people', { method: 'POST', body: JSON.stringify(body) })
}

export function patchPerson(id: string, body: { name?: string; email?: string | null; notes?: string | null }) {
  return request<{ data: Person }>(`/api/people/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function deletePerson(id: string) {
  return request<{ data: { id: string } }>(`/api/people/${id}`, { method: 'DELETE' })
}

export function getPersonBalance(id: string) {
  return request<{ data: { personId: string; balances: PersonBalance[] } }>(`/api/people/${id}/balance`)
}

export type SharedBalance = { personId: string; name: string; balances: PersonBalance[] }

export function getSharedBalances() {
  return request<{ data: SharedBalance[] }>('/api/analytics/shared-balances')
}

export function settlePerson(id: string, body: { walletId: string; assetId: string; amount?: string; splitIds?: string[] }) {
  return request<{ data: { transactionId: string; amount: string; settledSplitIds: string[] } }>(
    `/api/people/${id}/settle`,
    { method: 'POST', body: JSON.stringify(body) },
  )
}

export type TransactionSplitInput = { personId: string; assetId?: string; amount: string }

// ── Recurring rules ──────────────────────────────────────────────────────

export type RecurringRule = {
  id: string
  name: string
  template: {
    type: string
    description: string
    categoryId?: string | null
    entries: Array<{ walletId: string; assetId: string; amount: string }>
    splits?: TransactionSplitInput[]
  }
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  startAt: string
  endAt: string | null
  mode: 'auto_post' | 'draft'
  isActive: boolean
  nextRunAt: string
}

export function getRecurringRules() {
  return request<{ data: RecurringRule[] }>('/api/recurring-rules')
}

export function createRecurringRule(body: Omit<RecurringRule, 'id' | 'nextRunAt' | 'isActive'> & { isActive?: boolean }) {
  return request<{ data: RecurringRule }>('/api/recurring-rules', { method: 'POST', body: JSON.stringify(body) })
}

export function patchRecurringRule(id: string, body: Partial<Omit<RecurringRule, 'id' | 'nextRunAt'>>) {
  return request<{ data: RecurringRule }>(`/api/recurring-rules/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function deleteRecurringRule(id: string) {
  return request<{ data: { id: string } }>(`/api/recurring-rules/${id}`, { method: 'DELETE' })
}

export function previewRecurringRule(id: string, count = 5) {
  return request<{ data: { occurrences: string[] } }>(`/api/recurring-rules/${id}/preview?count=${count}`)
}

// ── Approval inbox ───────────────────────────────────────────────────────

export type Proposal = {
  id: string
  source: string
  actorLabel: string
  payload: { transaction?: { description?: string; type?: string; transactionDate?: string; entries?: Array<{ amount: string }> } }
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  resolvedAt: string | null
}

export function getInbox() {
  return request<{ data: Proposal[] }>('/api/inbox')
}

export function approveProposal(id: string) {
  return request<{ data: Proposal }>(`/api/inbox/${id}/approve`, { method: 'POST' })
}

export function rejectProposal(id: string) {
  return request<{ data: Proposal }>(`/api/inbox/${id}/reject`, { method: 'POST' })
}

// ── Net worth ────────────────────────────────────────────────────────────

export type NetWorth = {
  currency: string
  asOf: string
  total: number
  series: Array<{ month: string; total: number }>
  staleRates: boolean
  missing: string[]
}

export function getNetWorth(params?: { currency?: string; months?: number }) {
  const searchParams = new URLSearchParams()
  if (params?.currency) searchParams.set('currency', params.currency)
  if (params?.months) searchParams.set('months', String(params.months))
  const qs = searchParams.toString()
  return request<{ data: NetWorth }>(`/api/analytics/net-worth${qs ? `?${qs}` : ''}`)
}

// ── Asset prices ─────────────────────────────────────────────────────────

export type AssetPrice = {
  id: string
  assetId: string
  price: number
  currency: string
  asOf: string
  source: string
}

export function getAssetPrices(assetId: string) {
  return request<{ data: AssetPrice[] }>(`/api/asset-prices?assetId=${assetId}`)
}

export function createAssetPrice(body: { assetId: string; price: string; currency: string; asOf?: string }) {
  return request<{ data: AssetPrice }>('/api/asset-prices', { method: 'POST', body: JSON.stringify(body) })
}
