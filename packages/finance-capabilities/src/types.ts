export type RecentTx = {
  id: string; transactionDate: string; type: string; description: string
  notes: string | null; categoryName: string | null; amount: number
  currency: string; walletName: string
}

export type Summary = {
  totalIncome: number; totalExpense: number; totalTransfers: number; net: number
  transactionCount: number; walletCount: number; categoryCount: number
  dateRange: { from: string | null; to: string | null }
  byCurrency: CurrencySummary[]
}

export type CurrencySummary = {
  currency: string; income: number; expense: number
  transfer: number; adjustment: number; fee: number; net: number
}

export type CategoryBreakdown = {
  categoryId: string | null; categoryName: string | null
  total: number; count: number; type: string; currency: string
}

export type WalletMonthlySummary = {
  wallet: { id: string; name: string; currency: string }
  months: Array<{ month: string; income: number; expense: number; net: number }>
}
