import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { db, proposals, transactions } from '@finance-os/db'
import { and, desc, eq, sql } from 'drizzle-orm'
import { recordAudit } from '../lib/audit'
import { CreateTransactionError, createTransactionForUser } from '../lib/create-transaction'
import type { NewTransactionInput } from '../lib/create-transaction'

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
      await createTransactionForUser(payload.transaction, { userId: user.id, actorType: 'user' })
    } catch (err) {
      if (err instanceof CreateTransactionError) {
        return c.json({ error: { code: err.code, message: err.message } }, err.status as 404)
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
