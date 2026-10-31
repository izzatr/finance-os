export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

/** A failed API call. `code` is the server's machine code (e.g. VERSION_CONFLICT) when it sent one. */
export class ApiError extends Error {
  status: number
  code: string | null
  constructor(message: string, status: number, code: string | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

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
    throw new ApiError(
      payload?.error?.message ?? payload?.message ?? `Request failed with status ${response.status}`,
      response.status,
      payload?.error?.code ?? null,
    )
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
  portfolioValue?: {
    value: number
    currency: string
    asOf: string
  } | null
  /** 'split' = the system "Friends" wallet that holds balances with friends; never written directly. */
  systemRole?: string | null
}

export const isFriendsWallet = (w: Pick<Wallet, 'systemRole'>) => Boolean(w.systemRole)

/** Wallets a user may pick for writing (system wallets never are). */
export const pickableWallets = (wallets: Wallet[]) => wallets.filter((w) => w.isActive && !isFriendsWallet(w))

/** Wallet balances can arrive as numeric strings like '-128.40000000'. */
export const walletBalance = (w: Pick<Wallet, 'balance'>): number => (typeof w.balance === 'string' ? Number(w.balance) : w.balance)

/** Friends wallets worth showing: only those still holding a balance. */
export const visibleFriendsWallets = (wallets: Wallet[]) =>
  wallets.filter((w) => isFriendsWallet(w) && Math.abs(walletBalance(w)) >= 0.005)

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
  entryId: string
  transactionDate: string
  type: string
  description: string
  notes: string | null
  categoryName: string | null
  amount: number
  currency: string
  walletName: string
  /** Entry sits in the system Friends wallet. */
  friendsWallet?: boolean
  /** Set when a shared expense manages this transaction: edit it from Shared. */
  sharedExpenseId?: string | null
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

/** Account-level currency setup (one default and an ordered preferred list per account). */
export type CurrencySettings = {
  defaultCurrency: string
  /** False while the default is only the EUR fallback and the account never chose one. */
  defaultIsExplicit: boolean
  preferredCurrencies: string[]
  updatedAt: string | null
}
export type CatalogCurrency = { code: string; name: string; precision: number }

export function getCurrencySettings() {
  return request<{ data: CurrencySettings }>('/api/settings/currencies')
}

export function patchCurrencySettings(body: { defaultCurrency?: string; preferredCurrencies?: string[] }) {
  return request<{ data: CurrencySettings }>('/api/settings/currencies', json('PATCH', body))
}

export function getCurrencyCatalog() {
  return request<{ data: CatalogCurrency[] }>('/api/currencies')
}

/** Makes sure the currency's reference asset exists (needed to open a wallet in it); creates no wallet. */
export function ensureCurrencyAsset(code: string) {
  return request<{ data: { id: string; code: string; precision: number } }>('/api/assets/currency', json('POST', { code }))
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

export function getRecentTransactionsPage(params: { limit?: number; before?: string; beforeEntryId?: string }) {
  const searchParams = new URLSearchParams()
  if (params.limit) searchParams.set('limit', String(params.limit))
  if (params.before) searchParams.set('before', params.before)
  if (params.beforeEntryId) searchParams.set('beforeEntryId', params.beforeEntryId)
  return request<{ data: RecentTransaction[] }>(`/api/analytics/recent?${searchParams}`)
}

export type MonthReport = {
  month: string
  currency: string
  daysInMonth: number
  daysElapsed: number
  income: number
  spent: number
  fronted: number
  net: number
  savingsRate: number | null
  usual: { months: number; income: number; spent: number; net: number; savingsRate: number | null } | null
  pace: Array<{ day: number; current: number | null; usual: number | null }>
  spentByNow: number
  usualByNow: number | null
  categories: Array<{ id: string | null; name: string; spent: number; usual: number | null; count: number }>
  merchants: Array<{ name: string; spent: number; count: number }>
  biggest: Array<{ transactionId: string; description: string; date: string; spent: number; categoryName: string | null }>
  incomeSources: Array<{ name: string; amount: number }>
  history: Array<{ month: string; income: number; spent: number; net: number }>
  missing: string[]
}

export function getMonthReport(params: { month: string; currency: string; today: string; walletIds?: string[] }) {
  const searchParams = new URLSearchParams({ month: params.month, currency: params.currency, today: params.today })
  for (const walletId of params.walletIds ?? []) searchParams.append('walletId', walletId)
  return request<{ data: MonthReport }>(`/api/analytics/month-report?${searchParams}`)
}

type ReportParams = { from?: string; to?: string; walletIds?: string[] }

function reportSearchParams(params?: ReportParams) {
  const searchParams = new URLSearchParams()
  if (params?.from) searchParams.set('from', params.from)
  if (params?.to) searchParams.set('to', params.to)
  for (const walletId of params?.walletIds ?? []) searchParams.append('walletId', walletId)
  return searchParams
}

export function getSummary(params?: ReportParams) {
  const searchParams = reportSearchParams(params)
  const qs = searchParams.toString()
  return request<SummaryResponse>(`/api/analytics/summary${qs ? `?${qs}` : ''}`)
}

export type CategoryType = 'income' | 'expense' | 'transfer'

export type Category = {
  icon?: string | null
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

export function createCategory(body: { name: string; icon?: string | null; type?: CategoryType; parentId?: string }) {
  return request<{ data: Category }>('/api/categories', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function patchCategory(id: string, body: { name?: string; icon?: string | null; type?: CategoryType; parentId?: string | null }) {
  return request<{ data: Category }>(`/api/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function getCategoryBreakdown(params?: ReportParams) {
  const searchParams = reportSearchParams(params)
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
  sharedExpenseId?: string | null
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

export function getAssetGrowth(params?: ReportParams) {
  const searchParams = reportSearchParams(params)
  const qs = searchParams.toString()
  return request<{ data: AssetGrowth[] }>(`/api/analytics/asset-growth${qs ? `?${qs}` : ''}`)
}

export function getMonthlyTrend(params?: ReportParams) {
  const searchParams = reportSearchParams(params)
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

// ── Recurring rules ──────────────────────────────────────────────────────

export type RecurringRule = {
  id: string
  name: string
  template: {
    type: string
    description: string
    categoryId?: string | null
    entries: Array<{ walletId: string; assetId: string; amount: string }>
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
  payload: {
    transaction?: {
      description?: string
      type?: string
      transactionDate?: string
      categoryId?: string | null
      notes?: string | null
      entries?: Array<{ walletId?: string; assetId?: string; amount: string }>
      splits?: Array<{ personId: string; amount: string }>
    }
    digest?: string | null
  }
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

export type ProposalEdit = { description?: string; amount?: string; date?: string; walletId?: string; categoryId?: string | null }

export function editProposal(id: string, patch: ProposalEdit) {
  return request<{ data: Proposal }>(`/api/inbox/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
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

export function getNetWorth(params?: { currency?: string; months?: number; walletIds?: string[] }) {
  const searchParams = new URLSearchParams()
  if (params?.currency) searchParams.set('currency', params.currency)
  if (params?.months) searchParams.set('months', String(params.months))
  for (const walletId of params?.walletIds ?? []) searchParams.append('walletId', walletId)
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

// ── Portfolio ────────────────────────────────────────────────────────────

export type PortfolioSearchResult = {
  provider: 'yahoo'
  providerSymbol: string
  name: string
  instrumentType: 'stock' | 'etf' | 'crypto' | 'commodity'
  exchangeCode: string
  exchangeName: string
  mic: string | null
  currency: string
  timezone: string | null
}

export type PortfolioHoldingApi = {
  id: string
  walletId: string
  walletName: string
  quantity: string
  averageCost: string | null
  costCurrency: string | null
  listing: {
    id: string
    symbol: string
    provider: 'yahoo'
    providerSymbol: string
    currency: string
    exchangeCode: string
    exchangeName: string
    timezone: string
    instrumentName: string
    instrumentType: 'stock' | 'etf' | 'crypto' | 'commodity'
    lastRefreshAt: string | null
    lastSuccessAt: string | null
    refreshError: string | null
  }
}

export type PortfolioSummaryApi = {
  baseCurrency: string | null
  totalBaseValue: number | null
  nativeTotals: Record<string, number>
  asOf?: string | null
  source?: string | null
  status?: 'fresh' | 'stale' | 'partial' | 'empty'
  dailyChangeBase?: number | null
  dailyChangePercent?: number | null
  holdings: Array<PortfolioHoldingApi & {
    price: number | null
    previousClose?: number | null
    priceDate: string | null
    nativeCurrency: string
    nativeValue: number | null
    baseValue: number | null
    dailyChangePercent?: number | null
    priceStatus?: 'fresh' | 'stale' | 'error' | 'missing'
  }>
}

export type PortfolioHistoryApi = {
  baseCurrency: string | null
  points: Array<{ date: string; nativeTotals: Record<string, number>; baseValue: number | null }>
}

export type CreatePortfolioHoldingInput = {
  walletId: string
  provider: 'yahoo'
  providerSymbol: string
  quantity: string
  averageCost: string | null
  costCurrency: string | null
}

export function searchPortfolioInstruments(query: string, limit = 10) {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  return request<{ data: PortfolioSearchResult[] }>(`/api/portfolio/search?${params}`)
}

export function createPortfolioHolding(body: CreatePortfolioHoldingInput) {
  return request<{ data: PortfolioHoldingApi }>('/api/portfolio/holdings', { method: 'POST', body: JSON.stringify(body) })
}

export function updatePortfolioHolding(id: string, body: { quantity?: string; averageCost?: string | null; costCurrency?: string | null }) {
  return request<{ data: PortfolioHoldingApi }>(`/api/portfolio/holdings/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function deletePortfolioHolding(id: string) {
  return request<{ data: { id: string } }>(`/api/portfolio/holdings/${id}`, { method: 'DELETE' })
}

export function refreshPortfolioWallet(walletId: string) {
  return request<{ data: Array<{ listingId: string; upserted: number; error: string | null }> }>(`/api/portfolio/wallets/${walletId}/refresh`, { method: 'POST' })
}

export function getPortfolioSummary(walletId: string, baseCurrency: string) {
  const params = new URLSearchParams({ walletId, baseCurrency })
  return request<{ data: PortfolioSummaryApi }>(`/api/portfolio/summary?${params}`)
}

export function getPortfolioHistory(walletId: string, baseCurrency: string, from: string, to: string) {
  const params = new URLSearchParams({ walletId, baseCurrency, from, to })
  return request<{ data: PortfolioHistoryApi }>(`/api/portfolio/history?${params}`)
}

// ── AI assistant ─────────────────────────────────────────────────────────

export type AiStatus = { enabled: boolean; defaultModel: string | null }

export function getAiStatus() {
  return request<{ data: AiStatus }>('/api/ai/status')
}

export type ParsedTransaction = {
  type: 'expense' | 'income'
  amount: string
  description: string
  walletName?: string | null
  categoryName?: string | null
}

export function parseTransactionText(text: string) {
  return request<{ data: ParsedTransaction }>('/api/ai/parse-transaction', {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

// ── Shared expenses (Splitwise-style) ───────────────────────────────────

export type Money = { currency: string; amount: string }
export type SharedCategory = { slug: string; label: string; group: string; icon?: string | null }
export type RepeatInterval = 'never' | 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly'
export type GroupType = 'home' | 'trip' | 'couple' | 'other'

export type SplitMe = {
  personId: string
  displayName: string
  booksStart: string
  defaultCurrency: string
  unreadActivity: number
  balances: { owedToMe: Money[]; iOwe: Money[]; net: Money[] }
  categories: SharedCategory[]
}

export type SplitFriend = {
  personId: string
  name: string
  isGuest: boolean
  email: string | null
  isFriend: boolean
  /** Positive = they owe me. */
  balances: Money[]
  /** All balances converted to my default currency; null when a rate is missing. */
  totalInDefault?: { currency: string; owedToMe: number | string; iOwe: number | string; net: number | string } | null
}

export type SplitFriendDetail = SplitFriend & {
  canEdit: boolean
  breakdown: Array<{ groupId: string | null; groupName: string | null; balances: Money[] }>
  sharedGroups: Array<{ id: string; name: string }>
}

export type SplitGroupSummary = {
  icon?: string | null
  id: string
  name: string
  groupType: GroupType
  simplifyDebts: boolean
  memberCount: number
  myBalances: Money[]
}

export type SplitGroupMember = {
  personId: string
  name: string
  isGuest: boolean
  isMe: boolean
  isCurrent: boolean
  /** Net in this group: positive = gets back. */
  balances: Money[]
}

export type SplitGroup = {
  icon?: string | null
  id: string
  name: string
  groupType: GroupType
  simplifyDebts: boolean
  members: SplitGroupMember[]
  suggested: Array<{ fromPersonId: string; toPersonId: string; currency: string; amount: string }>
}

export type SplitShare = { personId: string; name: string; isGuest: boolean; paid: string; owed: string }

export type SharedExpense = {
  id: string
  groupId: string | null
  groupName: string | null
  kind: 'expense' | 'payment'
  description: string
  cost: string
  currency: string
  date: string
  category: string
  notes: string | null
  splitMethod: string
  splitInput: import('./split').SplitInput | null
  paidInput: import('./split').PaidInput | null
  repeatInterval: RepeatInterval
  /** When the next copy will be created; null when it does not repeat. */
  nextRepeatAt: string | null
  shares: SplitShare[]
  createdBy: { personId: string; name: string }
  updatedBy: { personId: string; name: string } | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  version: number
  me: { paid: string; owed: string; net: string } | null
  myBooks: {
    fundingWalletId: string | null
    fundingAmount: string | null
    categoryId: string | null
    linkedTransactionId: string | null
    transactionId: string | null
  } | null
}

export type MyBooksInput = {
  fundingWalletId?: string | null
  fundingAmount?: string | null
  categoryId?: string | null
  linkedTransactionId?: string | null
}

export type SharedExpenseInput = {
  groupId?: string | null
  kind: 'expense' | 'payment'
  description?: string
  cost: string
  currency: string
  date: string
  category?: string
  notes?: string | null
  paid?: import('./split').PaidInput
  split?: import('./split').SplitInput
  payment?: { fromPersonId: string; toPersonId: string }
  repeatInterval?: RepeatInterval
  myBooks?: MyBooksInput
}

export type SplitComment = { id: string; personId: string; name: string; body: string; createdAt: string; isMine: boolean }

export type SplitActivity = {
  id: string
  kind: string
  actorPersonId: string | null
  actorName: string | null
  groupId: string | null
  groupName: string | null
  expenseId: string | null
  data: Record<string, unknown>
  createdAt: string
  isMine: boolean
  unread: boolean
}

export type InvitePreview = { status: 'valid' | 'expired' | 'claimed' | 'revoked'; guestName: string; inviterName: string }

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })

export function getSplitMe() {
  return request<{ data: SplitMe }>('/api/split/me')
}

export function patchSharedCategoryIcon(slug: string, icon: string | null) {
  return request<{ data: { slug: string; icon: string | null } }>(`/api/split/category-icons/${encodeURIComponent(slug)}`, { method: 'PATCH', body: JSON.stringify({ icon }) })
}

export function patchSplitMe(body: { defaultCurrency?: string; activitySeen?: boolean; booksStart?: string }) {
  return request<{ data: { ok: true } }>('/api/split/me', json('PATCH', body))
}

/** Turns an existing wallet (e.g. a hand-kept "Splitwise €" wallet) into the Friends wallet for its currency. */
export function adoptFriendsWallet(walletId: string) {
  return request<{ data: { ok: true } }>('/api/split/me/adopt-wallet', json('POST', { walletId }))
}

export function getSplitFriends() {
  return request<{ data: SplitFriend[] }>('/api/split/friends')
}

export function addSplitFriend(body: { name: string; email?: string | null }) {
  return request<{ data: { id: string } }>('/api/split/friends', json('POST', body))
}

export function getSplitFriend(id: string) {
  return request<{ data: SplitFriendDetail }>(`/api/split/friends/${id}`)
}

export function patchSplitFriend(id: string, body: { name?: string; email?: string | null }) {
  return request<{ data: { ok: true } }>(`/api/split/friends/${id}`, json('PATCH', body))
}

export function removeSplitFriend(id: string) {
  return request<{ data: { ok: true } }>(`/api/split/friends/${id}`, json('DELETE'))
}

export function createSplitInvite(personId: string) {
  return request<{ data: { token: string; expiresAt: string; guestName: string } }>(`/api/split/persons/${personId}/invite`, json('POST'))
}

export function getInvitePreview(token: string) {
  return request<{ data: InvitePreview }>(`/api/public/split-invites/${encodeURIComponent(token)}`)
}

export function claimSplitInvite(token: string) {
  return request<{ data: { personId: string; mergedGuestId: string; expenses: number } }>(`/api/split/invites/${encodeURIComponent(token)}/claim`, json('POST'))
}

export function getSplitGroups() {
  return request<{ data: SplitGroupSummary[] }>('/api/split/groups')
}

export function getDeletedSplitGroups() {
  return request<{ data: Array<{ id: string; name: string; deletedAt: string }> }>('/api/split/groups?deleted=true')
}

export function createSplitGroup(body: { name: string; icon?: string | null; groupType?: GroupType; simplifyDebts?: boolean; memberIds?: string[] }) {
  return request<{ data: { id: string } }>('/api/split/groups', json('POST', body))
}

export function getSplitGroup(id: string) {
  return request<{ data: SplitGroup }>(`/api/split/groups/${id}`)
}

export function patchSplitGroup(id: string, body: { name?: string; icon?: string | null; groupType?: GroupType; simplifyDebts?: boolean }) {
  return request<{ data: { ok: true } }>(`/api/split/groups/${id}`, json('PATCH', body))
}

export function deleteSplitGroup(id: string) {
  return request<{ data: { ok: true } }>(`/api/split/groups/${id}`, json('DELETE'))
}

export function restoreSplitGroup(id: string) {
  return request<{ data: { ok: true } }>(`/api/split/groups/${id}/restore`, json('POST'))
}

export function addSplitGroupMember(groupId: string, body: { personId: string } | { name: string; email?: string | null }) {
  return request<{ data: { id: string } }>(`/api/split/groups/${groupId}/members`, json('POST', body))
}

export function removeSplitGroupMember(groupId: string, personId: string) {
  return request<{ data: { ok: true } }>(`/api/split/groups/${groupId}/members/${personId}`, json('DELETE'))
}

export function splitGroupExportUrl(groupId: string) {
  return `${API_BASE_URL}/api/split/groups/${groupId}/export.csv`
}

export type ExpenseCursor = { date: string; id: string }

export function getSharedExpenses(params: { groupId?: string; friendId?: string; q?: string; before?: ExpenseCursor; limit?: number; includeDeleted?: boolean; repeating?: boolean }) {
  const sp = new URLSearchParams()
  if (params.repeating) sp.set('repeating', 'true')
  if (params.groupId) sp.set('groupId', params.groupId)
  if (params.friendId) sp.set('friendId', params.friendId)
  if (params.q) sp.set('q', params.q)
  if (params.before) {
    sp.set('beforeDate', params.before.date)
    sp.set('beforeId', params.before.id)
  }
  if (params.limit) sp.set('limit', String(params.limit))
  if (params.includeDeleted) sp.set('includeDeleted', 'true')
  const qs = sp.toString()
  return request<{ data: SharedExpense[]; next: ExpenseCursor | null }>(`/api/split/expenses${qs ? `?${qs}` : ''}`)
}

export function createSharedExpense(body: SharedExpenseInput) {
  return request<{ data: { id: string } }>('/api/split/expenses', json('POST', body))
}

export function getSharedExpense(id: string) {
  return request<{ data: SharedExpense }>(`/api/split/expenses/${id}`)
}

export function updateSharedExpense(id: string, body: SharedExpenseInput & { version?: number }) {
  return request<{ data: { ok: true } }>(`/api/split/expenses/${id}`, json('PATCH', body))
}

export function deleteSharedExpense(id: string) {
  return request<{ data: { ok: true } }>(`/api/split/expenses/${id}`, json('DELETE'))
}

export function restoreSharedExpense(id: string) {
  return request<{ data: { ok: true } }>(`/api/split/expenses/${id}/restore`, json('POST'))
}

export function putMyBooks(id: string, body: MyBooksInput) {
  return request<{ data: { ok: true } }>(`/api/split/expenses/${id}/my-books`, json('PUT', body))
}

export function getSplitComments(expenseId: string) {
  return request<{ data: SplitComment[] }>(`/api/split/expenses/${expenseId}/comments`)
}

export function addSplitComment(expenseId: string, body: string) {
  return request<{ data: { id: string } }>(`/api/split/expenses/${expenseId}/comments`, json('POST', { body }))
}

export function deleteSplitComment(commentId: string) {
  return request<{ data: { ok: true } }>(`/api/split/comments/${commentId}`, json('DELETE'))
}

export type ActivityCursor = { at: string; id: string }

export function getSplitActivity(params: { groupId?: string; before?: ActivityCursor; limit?: number } = {}) {
  const sp = new URLSearchParams()
  if (params.groupId) sp.set('groupId', params.groupId)
  if (params.before) {
    sp.set('beforeAt', params.before.at)
    sp.set('beforeId', params.before.id)
  }
  if (params.limit) sp.set('limit', String(params.limit))
  const qs = sp.toString()
  return request<{ data: SplitActivity[]; next: ActivityCursor | null }>(`/api/split/activity${qs ? `?${qs}` : ''}`)
}
