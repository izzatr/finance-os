/**
 * Shared finance capabilities — pure business-logic functions for Finance OS.
 *
 * These are framework-agnostic: used by both the local stdio MCP and the
 * remote HTTP MCP gateway. No auth concerns live here; callers handle
 * authentication and entitlement checks.
 */

import type { RecentTx, Summary, CategoryBreakdown, WalletMonthlySummary } from './types'

// ── Types (re-exported from API shape) ───────────────────────────────────────

export type { RecentTx, Summary, CategoryBreakdown, WalletMonthlySummary }

export type FinanceContext = {
  baseUrl: string
  apiKey?: string
}

async function request<T>(ctx: FinanceContext, path: string): Promise<T> {
  const res = await fetch(`${ctx.baseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(ctx.apiKey ? { Authorization: `Bearer ${ctx.apiKey}` } : {}),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Finance API ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

// ── Balance ────────────────────────────────────────────────────────────────────

export async function getBalance(ctx: FinanceContext, filter?: string) {
  const { data: wallets } = await request<{ data: Array<{
    id: string; name: string; currency: string; balance: number
  }> }>(ctx, '/api/wallets')

  const { data: summary } = await request<{ data: Summary }>(ctx, '/api/analytics/summary')

  let filtered = wallets
  if (filter) {
    const f = filter.toLowerCase()
    filtered = wallets.filter(w =>
      w.name.toLowerCase().includes(f) || w.currency.toLowerCase() === f,
    )
  }

  const byCurrency: Record<string, typeof filtered> = {}
  for (const w of filtered) {
    ;(byCurrency[w.currency] ??= []).push(w)
  }

  return {
    totalByCurrency: summary.byCurrency.map(c => ({ currency: c.currency, balance: c.net })),
    wallets: byCurrency,
  }
}

// ── Summary ────────────────────────────────────────────────────────────────────

export async function getSummary(ctx: FinanceContext) {
  const { data } = await request<{ data: Summary }>(ctx, '/api/analytics/summary')
  return data
}

// ── Recent transactions ────────────────────────────────────────────────────────

export async function getRecentTransactions(ctx: FinanceContext, filter?: string, limit?: number) {
  const { data: txns } = await request<{ data: RecentTx[] }>(ctx, '/api/analytics/recent')

  let filtered = txns
  if (filter) {
    const f = filter.toLowerCase()
    filtered = txns.filter(tx =>
      tx.walletName.toLowerCase().includes(f) ||
      (tx.categoryName?.toLowerCase().includes(f) ?? false) ||
      tx.currency.toLowerCase() === f ||
      tx.description.toLowerCase().includes(f),
    )
  }
  if (limit) filtered = filtered.slice(0, limit)

  return filtered
}

// ── Spending breakdown ─────────────────────────────────────────────────────────

export async function getSpendingBreakdown(ctx: FinanceContext) {
  const { data } = await request<{ data: CategoryBreakdown[] }>(
    ctx, '/api/analytics/category-breakdown',
  )
  return data
}

// ── Wallet monthly summary ──────────────────────────────────────────────────────

export async function getWalletMonthlySummary(ctx: FinanceContext, walletId: string) {
  const { data } = await request<{ data: WalletMonthlySummary }>(
    ctx, `/api/wallets/${walletId}/monthly-summary`,
  )
  return data
}

// ── Categories ─────────────────────────────────────────────────────────────────

export type Category = { id: string; name: string; slug: string }

export async function getCategories(ctx: FinanceContext) {
  const { data } = await request<{ data: Category[] }>(ctx, '/api/categories')
  return data
}

// ── Search ─────────────────────────────────────────────────────────────────────

export async function searchTransactions(ctx: FinanceContext, params: {
  q?: string; wallet?: string; category?: string; from?: string; to?: string
}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined),
  ).toString()
  const { data } = await request<{ data: RecentTx[] }>(
    ctx, `/api/transactions/search${qs ? `?${qs}` : ''}`,
  )
  return data
}
