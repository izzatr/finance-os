import type { RepeatInterval, SharedExpense, SharedExpenseInput, Wallet } from './api'
import { parseAmountInput } from './money'
import {
  computeShares,
  currencyPrecision,
  draftFromSplitInput,
  emptySplitDraft,
  paidInputFromDraft,
  splitInputFromDraft,
  SplitMathError,
  toMinor,
  type PaidDraft,
  type SplitDraft,
} from './split'

export type BooksMode = 'none' | 'wallet' | 'link'

export type ExpenseDraft = {
  description: string
  cost: string
  currency: string
  /** YYYY-MM-DD, the calendar day of the expense. */
  date: string
  groupId: string | null
  /** People in a non-group expense besides me. */
  friendIds: string[]
  category: string
  notes: string
  repeat: RepeatInterval
  paid: PaidDraft
  split: SplitDraft
  books: {
    mode: BooksMode
    walletId: string | null
    fundingAmount: string
    linkedTransactionId: string | null
    /** Override for my own category; null = pick automatically from the shared category. */
    categoryId: string | null
  }
}

export function newExpenseDraft(opts: { mePersonId: string; currency: string; date: string; groupId?: string | null; friendIds?: string[]; participants: string[] }): ExpenseDraft {
  return {
    description: '',
    cost: '',
    currency: opts.currency,
    date: opts.date,
    groupId: opts.groupId ?? null,
    friendIds: opts.friendIds ?? [],
    category: 'general',
    notes: '',
    repeat: 'never',
    paid: { mode: 'single', personId: opts.mePersonId },
    split: emptySplitDraft(opts.participants),
    books: { mode: 'none', walletId: null, fundingAmount: '', linkedTransactionId: null, categoryId: null },
  }
}

/** Seeds the editor from a saved expense. */
export function draftFromExpense(e: SharedExpense, mePersonId: string): ExpenseDraft {
  const participants = e.shares.map((s) => s.personId)
  const paid: PaidDraft = e.paidInput?.kind === 'single'
    ? { mode: 'single', personId: e.paidInput.personId }
    : e.paidInput?.kind === 'multiple'
      ? { mode: 'multiple', amounts: { ...e.paidInput.amounts } }
      : { mode: 'single', personId: mePersonId }
  const books = e.myBooks
  return {
    description: e.description,
    cost: e.cost,
    currency: e.currency,
    date: e.date.slice(0, 10),
    groupId: e.groupId,
    friendIds: participants.filter((id) => id !== mePersonId),
    category: e.category,
    notes: e.notes ?? '',
    repeat: e.repeatInterval,
    paid,
    split: draftFromSplitInput(e.splitInput, participants),
    books: {
      mode: books?.linkedTransactionId ? 'link' : books?.fundingWalletId ? 'wallet' : 'none',
      walletId: books?.fundingWalletId ?? null,
      fundingAmount: books?.fundingAmount ?? '',
      linkedTransactionId: books?.linkedTransactionId ?? null,
      categoryId: books?.categoryId ?? null,
    },
  }
}

/** Did I pay anything in this draft? Wallet / linked-transaction choices only matter then. */
export function iPaid(draft: ExpenseDraft, mePersonId: string): boolean {
  if (draft.paid.mode === 'single') return draft.paid.personId === mePersonId
  const v = (draft.paid.amounts[mePersonId] ?? '').trim()
  return v !== '' && Number(v.replace(',', '.')) > 0
}

export type BuildResult = { ok: true; body: SharedExpenseInput } | { ok: false; error: string }

/** Validates the draft with the same math as the server and builds the POST/PATCH body. */
export function buildExpensePayload(draft: ExpenseDraft, participants: string[], mePersonId: string, wallets: Wallet[]): BuildResult {
  const description = draft.description.trim()
  if (!description) return { ok: false, error: 'Add a description' }
  const cost = parseAmountInput(draft.cost)
  if (!cost) return { ok: false, error: 'Enter an amount greater than zero' }
  if (participants.length < 2 && !draft.groupId) return { ok: false, error: 'Add at least one friend to split with' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return { ok: false, error: 'Pick a date' }
  const precision = currencyPrecision(draft.currency)
  const paid = paidInputFromDraft(draft.paid, participants)
  const split = splitInputFromDraft(draft.split, participants)
  try {
    computeShares(toMinor(cost, precision), precision, paid, split)
  } catch (err) {
    return { ok: false, error: err instanceof SplitMathError ? err.message : 'This split does not add up' }
  }

  const body: SharedExpenseInput = {
    groupId: draft.groupId,
    kind: 'expense',
    description,
    cost,
    currency: draft.currency,
    date: new Date(`${draft.date}T12:00:00.000Z`).toISOString(),
    category: draft.category,
    notes: draft.notes.trim() ? draft.notes.trim() : null,
    paid,
    split,
    repeatInterval: draft.repeat,
  }

  if (participants.includes(mePersonId)) {
    const paidByMe = iPaid(draft, mePersonId)
    const mode = paidByMe ? draft.books.mode : 'none'
    let fundingWalletId: string | null = null
    let fundingAmount: string | null = null
    let linkedTransactionId: string | null = null
    if (mode === 'wallet') {
      const wallet = wallets.find((w) => w.id === draft.books.walletId)
      if (!wallet) return { ok: false, error: 'Pick the wallet you paid from' }
      fundingWalletId = wallet.id
      if (wallet.currency !== draft.currency) {
        fundingAmount = parseAmountInput(draft.books.fundingAmount)
        if (!fundingAmount) return { ok: false, error: `Enter what ${wallet.name} was charged in ${wallet.currency}` }
      }
    } else if (mode === 'link') {
      if (!draft.books.linkedTransactionId) return { ok: false, error: 'Pick the transaction to link' }
      linkedTransactionId = draft.books.linkedTransactionId
    }
    body.myBooks = { fundingWalletId, fundingAmount, linkedTransactionId, categoryId: draft.books.categoryId }
  }
  return { ok: true, body }
}
