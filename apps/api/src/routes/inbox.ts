import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { categories, db, proposals, transactions, wallets } from '@finance-os/db'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { recordAudit } from '../lib/audit'
import { CreateTransactionError, createTransactionForUser } from '../lib/create-transaction'
import type { NewTransactionInput } from '../lib/create-transaction'
import { isUniqueViolation } from '../lib/db-errors'

const proposalShape = z.object({
  id: z.string().uuid(),
  source: z.string(),
  actorLabel: z.string(),
  payload: z.record(z.unknown()),
  status: z.enum(['pending', 'approved', 'rejected']),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
})

const errorShape = z.object({ error: z.object({ code: z.string(), message: z.string() }) })

function toResponseShape(row: typeof proposals.$inferSelect) {
  return {
    id: row.id,
    source: row.source,
    actorLabel: row.actorLabel,
    payload: row.payload,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  }
}

async function loadOwnProposal(userId: string, id: string) {
  const [row] = await db.select().from(proposals)
    .where(and(eq(proposals.id, id), eq(proposals.userId, userId)))
  return row
}

export function registerInboxRoutes(app: OpenAPIHono) {
  const listInboxRoute = createRoute({
    method: 'get',
    path: '/api/inbox',
    tags: ['inbox'],
    responses: {
      200: {
        description: 'Proposals awaiting review — pending first, newest first within each group',
        content: { 'application/json': { schema: z.object({ data: z.array(proposalShape) }) } },
      },
    },
  })

  const approveRoute = createRoute({
    method: 'post',
    path: '/api/inbox/{id}/approve',
    tags: ['inbox'],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: {
        description: 'Proposal approved; the transaction was booked',
        content: { 'application/json': { schema: z.object({ data: proposalShape }) } },
      },
      404: {
        description: 'Proposal not found',
        content: { 'application/json': { schema: errorShape } },
      },
      409: {
        description: 'Proposal already resolved, or its occurrence already materialized',
        content: { 'application/json': { schema: errorShape } },
      },
    },
  })

  const rejectRoute = createRoute({
    method: 'post',
    path: '/api/inbox/{id}/reject',
    tags: ['inbox'],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: {
        description: 'Proposal rejected',
        content: { 'application/json': { schema: z.object({ data: proposalShape }) } },
      },
      404: {
        description: 'Proposal not found',
        content: { 'application/json': { schema: errorShape } },
      },
      409: {
        description: 'Proposal already resolved',
        content: { 'application/json': { schema: errorShape } },
      },
    },
  })

  app.openapi(listInboxRoute, async (c) => {
    const user = c.get('user')
    const rows = await db.select().from(proposals)
      .where(eq(proposals.userId, user.id))
      .orderBy(sql`CASE WHEN ${proposals.status} = 'pending' THEN 0 ELSE 1 END`, desc(proposals.createdAt))
    return c.json({ data: rows.map(toResponseShape) }, 200)
  })

  app.openapi(approveRoute, async (c) => {
    const user = c.get('user')
    const { id } = c.req.valid('param')

    const row = await loadOwnProposal(user.id, id)
    if (!row) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Proposal not found' } }, 404)
    }
    if (row.status !== 'pending') {
      return c.json({ error: { code: 'ALREADY_RESOLVED', message: 'Proposal has already been resolved' } }, 409)
    }

    const payload = row.payload as { transaction?: NewTransactionInput; dedupeRef?: string }
    if (!payload.transaction) {
      return c.json({ error: { code: 'INVALID_PAYLOAD', message: 'Proposal carries no transaction payload' } }, 409)
    }

    // Race guard: a later auto-post (or a retried approval) may have booked this
    // occurrence already. The proposal stays pending so the user can reject it.
    const dedupeRef = payload.dedupeRef ?? payload.transaction.externalRef
    if (dedupeRef) {
      const [existing] = await db.select({ id: transactions.id }).from(transactions)
        .where(and(eq(transactions.userId, user.id), eq(transactions.externalRef, dedupeRef)))
      if (existing) {
        return c.json({ error: { code: 'ALREADY_MATERIALIZED', message: 'This occurrence was already booked' } }, 409)
      }
    }

    try {
      await createTransactionForUser(payload.transaction, { userId: user.id, actorType: c.get('authMethod') ?? 'user' })
    } catch (err) {
      if (err instanceof CreateTransactionError) {
        return c.json({ error: { code: err.code, message: err.message } }, err.status as 404)
      }
      // Lost the race against an auto-post between our check and the insert: the partial
      // unique index rejected the duplicate ref. Same outcome as the explicit guard above.
      if (isUniqueViolation(err)) {
        return c.json({ error: { code: 'ALREADY_MATERIALIZED', message: 'This occurrence was already booked' } }, 409)
      }
      throw err
    }

    const [updated] = await db.update(proposals)
      .set({ status: 'approved', resolvedAt: new Date() })
      .where(and(eq(proposals.id, id), eq(proposals.userId, user.id)))
      .returning()

    await recordAudit({
      actorType: c.get('authMethod') ?? 'user',
      actorId: user.id,
      action: 'proposal.approve',
      resourceType: 'proposal',
      resourceId: id,
    })

    return c.json({ data: toResponseShape(updated) }, 200)
  })

  const editRoute = createRoute({
    method: 'patch',
    path: '/api/inbox/{id}',
    tags: ['inbox'],
    description: 'Correct a pending single-entry expense or income proposal before approving it (description, amount, date, wallet, category).',
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              description: z.string().trim().min(1).max(255).optional(),
              amount: z.string().regex(/^\d+(\.\d+)?$/).optional().describe('Positive amount; the sign follows the transaction type'),
              date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
              walletId: z.string().uuid().optional(),
              categoryId: z.string().uuid().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: 'Proposal updated', content: { 'application/json': { schema: z.object({ data: proposalShape }) } } },
      400: { description: 'This proposal cannot be edited', content: { 'application/json': { schema: errorShape } } },
      404: { description: 'Proposal, wallet or category not found', content: { 'application/json': { schema: errorShape } } },
      409: { description: 'Proposal already resolved', content: { 'application/json': { schema: errorShape } } },
    },
  })

  app.openapi(editRoute, async (c) => {
    const user = c.get('user')
    const { id } = c.req.valid('param')
    const patch = c.req.valid('json')

    const row = await loadOwnProposal(user.id, id)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Proposal not found' } }, 404)
    if (row.status !== 'pending') return c.json({ error: { code: 'ALREADY_RESOLVED', message: 'Proposal has already been resolved' } }, 409)

    const payload = row.payload as { transaction?: NewTransactionInput } & Record<string, unknown>
    const tx = payload.transaction
    if (!tx || tx.entries.length !== 1 || (tx.type !== 'expense' && tx.type !== 'income')) {
      return c.json({ error: { code: 'NOT_EDITABLE', message: 'Only single-wallet expenses and income can be edited here' } }, 400)
    }

    const next: NewTransactionInput = { ...tx, entries: [{ ...tx.entries[0] }] }
    if (patch.description !== undefined) next.description = patch.description
    if (patch.date !== undefined) next.transactionDate = `${patch.date}T12:00:00.000Z`
    if (patch.amount !== undefined) next.entries[0].amount = tx.type === 'income' ? patch.amount : `-${patch.amount}`
    if (patch.walletId !== undefined) {
      const [wallet] = await db.select({ id: wallets.id, assetId: wallets.assetId }).from(wallets)
        .where(and(eq(wallets.id, patch.walletId), eq(wallets.userId, user.id), isNull(wallets.deletedAt)))
      if (!wallet) return c.json({ error: { code: 'WALLET_NOT_FOUND', message: 'Wallet not found' } }, 404)
      next.entries[0].walletId = wallet.id
      next.entries[0].assetId = wallet.assetId
      // Split shares are denominated in the wallet's asset; keep them consistent with the new wallet.
      if (next.splits) next.splits = next.splits.map((s) => ({ ...s, assetId: wallet.assetId }))
    }
    if (patch.categoryId !== undefined) {
      if (patch.categoryId !== null) {
        const [category] = await db.select({ id: categories.id }).from(categories)
          .where(and(eq(categories.id, patch.categoryId), eq(categories.userId, user.id)))
        if (!category) return c.json({ error: { code: 'CATEGORY_NOT_FOUND', message: 'Category not found' } }, 404)
      }
      next.categoryId = patch.categoryId
    }

    const [updated] = await db.update(proposals)
      .set({ payload: { ...payload, transaction: next } })
      .where(and(eq(proposals.id, id), eq(proposals.userId, user.id), eq(proposals.status, 'pending')))
      .returning()
    if (!updated) return c.json({ error: { code: 'ALREADY_RESOLVED', message: 'Proposal has already been resolved' } }, 409)

    await recordAudit({ actorType: c.get('authMethod') ?? 'user', actorId: user.id, action: 'proposal.edit', resourceType: 'proposal', resourceId: id })
    return c.json({ data: toResponseShape(updated) }, 200)
  })

  app.openapi(rejectRoute, async (c) => {
    const user = c.get('user')
    const { id } = c.req.valid('param')

    const row = await loadOwnProposal(user.id, id)
    if (!row) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Proposal not found' } }, 404)
    }
    if (row.status !== 'pending') {
      return c.json({ error: { code: 'ALREADY_RESOLVED', message: 'Proposal has already been resolved' } }, 409)
    }

    const [updated] = await db.update(proposals)
      .set({ status: 'rejected', resolvedAt: new Date() })
      .where(and(eq(proposals.id, id), eq(proposals.userId, user.id)))
      .returning()

    await recordAudit({
      actorType: c.get('authMethod') ?? 'user',
      actorId: user.id,
      action: 'proposal.reject',
      resourceType: 'proposal',
      resourceId: id,
    })

    return c.json({ data: toResponseShape(updated) }, 200)
  })
}
