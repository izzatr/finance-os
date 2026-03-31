const BASE = process.env.FINANCE_API_URL ?? 'http://localhost:27032'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

function qs(params: Record<string, string | boolean | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined)
  if (entries.length === 0) return ''
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
}

// ── Types ────────────────────────────────────────────────────────────────────

export type Wallet = {
  id: string; name: string; walletType: string; institution: string | null
  assetId: string; isActive: boolean; balance: number; currency: string
}

export type RecentTx = {
  id: string; transactionDate: string; type: string; description: string
  notes: string | null; categoryName: string | null; amount: number
  currency: string; walletName: string
}

export type Category = { id: string; name: string; slug: string }

export type CurrencySummary = {
  currency: string; income: number; expense: number
  transfer: number; adjustment: number; fee: number; net: number
}

export type Summary = {
  totalIncome: number; totalExpense: number; totalTransfers: number; net: number
  transactionCount: number; walletCount: number; categoryCount: number
  dateRange: { from: string | null; to: string | null }
  byCurrency: CurrencySummary[]
}

export type CategoryBreakdown = {
  categoryId: string | null; categoryName: string | null
  total: number; count: number; type: string; currency: string
}

export type WalletMonthlySummary = {
  wallet: { id: string; name: string; currency: string }
  months: Array<{ month: string; income: number; expense: number; net: number }>
}

// ── API calls ────────────────────────────────────────────────────────────────

export const api = {
  // ── Read ─────────────────────────────────────────────────────────────
  wallets: () => request<{ data: Wallet[] }>('/api/wallets'),
  assets: () => request<{ data: Array<{ id: string; code: string; name: string }> }>('/api/assets'),
  categories: () => request<{ data: Category[] }>('/api/categories'),
  recent: () => request<{ data: RecentTx[] }>('/api/analytics/recent'),
  summary: () => request<{ data: Summary }>('/api/analytics/summary'),
  categoryBreakdown: () => request<{ data: CategoryBreakdown[] }>('/api/analytics/category-breakdown'),
  dashboard: () => request<{ data: { walletCount: number; assetCount: number; transactionCount: number; importCount: number } }>('/api/dashboard'),

  walletMonthlySummary: (id: string) =>
    request<{ data: WalletMonthlySummary }>(`/api/wallets/${id}/monthly-summary`),

  // ── Search ───────────────────────────────────────────────────────────
  searchTransactions: (params: {
    q?: string; wallet?: string; category?: string
    from?: string; to?: string; includeDeleted?: boolean
  }) => request<{ data: RecentTx[] }>(`/api/transactions/search${qs(params)}`),

  // ── Create ───────────────────────────────────────────────────────────
  createTransaction: (body: {
    transactionDate: string; type: string; description: string
    notes?: string
    entries: Array<{ walletId: string; assetId: string; amount: string }>
  }) => request<{ data: unknown }>('/api/transactions', {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  bulkCreateTransactions: (body: {
    transactions: Array<{
      transactionDate: string; type: string; description: string
      notes?: string
      entries: Array<{ walletId: string; assetId: string; amount: string }>
    }>
  }) => request<{ data: { created: number; ids: string[] } }>('/api/transactions/bulk', {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  createWallet: (body: {
    name: string; walletType: string; assetId: string
    institution?: string; isActive?: boolean
  }) => request<{ data: Wallet }>('/api/wallets', {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  createCategory: (body: { name: string }) =>
    request<{ data: Category }>('/api/categories', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ── Update ───────────────────────────────────────────────────────────
  updateTransaction: (id: string, body: {
    description?: string; type?: string; transactionDate?: string
    notes?: string | null; categoryId?: string | null; amount?: string
  }) => request<{ data: unknown }>(`/api/transactions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }),

  updateWallet: (id: string, body: {
    name?: string; walletType?: string; institution?: string | null; isActive?: boolean
  }) => request<{ data: Wallet }>(`/api/wallets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }),

  updateCategory: (id: string, body: { name?: string }) =>
    request<{ data: Category }>(`/api/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  // ── Delete (soft) ────────────────────────────────────────────────────
  deleteTransaction: (id: string) =>
    request<{ data: { id: string; deletedAt: string } }>(`/api/transactions/${id}`, { method: 'DELETE' }),

  deleteWallet: (id: string) =>
    request<{ data: { id: string; deletedAt: string } }>(`/api/wallets/${id}`, { method: 'DELETE' }),

  // ── Restore ──────────────────────────────────────────────────────────
  restoreTransaction: (id: string) =>
    request<{ data: { id: string } }>(`/api/transactions/${id}/restore`, { method: 'POST' }),

  restoreWallet: (id: string) =>
    request<{ data: { id: string } }>(`/api/wallets/${id}/restore`, { method: 'POST' }),
}
