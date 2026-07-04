import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { db, proposals } from '@finance-os/db'
import { transactionSchema } from '@finance-os/domain'
import { recordAudit } from '../lib/audit'
import { CreateTransactionError, validateNewTransaction } from '../lib/create-transaction'
import type { NewTransactionInput } from '../lib/create-transaction'

/**
 * Proposal intake — the approval-inbox front door for agents.
 * Propose-scoped API keys may POST here (and nowhere else that writes);
 * the transaction is validated NOW so approving it later cannot fail on
 * bad references, but nothing touches the ledger until the owner approves.
 */
export function registerProposalRoutes(app: OpenAPIHono) {
  const createProposalRoute = createRoute({
    method: 'post',
    path: '/api/proposals',
    tags: ['inbox'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              transaction: transactionSchema.extend({
                categoryId: z.string().uuid().optional(),
                splits: z.array(z.object({
                  personId: z.string().uuid(),
                  assetId: z.string().uuid().optional(),
                  amount: z.string().regex(/^\d+(\.\d+)?$/),
                })).optional(),
              }),
              actorLabel: z.string().max(120).optional(),
              source: z.enum(['ai_chat', 'draft']).optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Proposal created — pending in the approval inbox',
        content: {
          'application/json': {
            schema: z.object({ data: z.object({ id: z.string().uuid(), status: z.string() }) }),
          },
        },
      },
      400: {
        description: 'Invalid transaction payload',
        content: {
          'application/json': {
            schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
          },
        },
      },
      404: {
        description: 'Referenced wallet, category, or person not found',
        content: {
          'application/json': {
            schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
          },
        },
      },
    },
  })

  app.openapi(createProposalRoute, async (c) => {
    const user = c.get('user')
    const { transaction, actorLabel, source: requestedSource } = c.req.valid('json')

    try {
      await validateNewTransaction(transaction as NewTransactionInput, user.id)
    } catch (err) {
      if (err instanceof CreateTransactionError) {
        return c.json({ error: { code: err.code, message: err.message } }, err.status as 400)
      }
      throw err
    }

    // API keys are always attributed as agents; sessions may declare the AI chat.
    const source = c.get('authMethod') === 'api_key' ? 'mcp' : (requestedSource ?? 'draft')
    const label = actorLabel ?? c.get('keyName') ?? 'Manual draft'

    const [row] = await db.insert(proposals).values({
      userId: user.id,
      source,
      actorLabel: label,
      payload: { transaction, dedupeRef: (transaction as NewTransactionInput).externalRef ?? undefined },
    }).returning()

    await recordAudit({
      actorType: c.get('authMethod') ?? 'user',
      actorId: user.id,
      action: 'proposal.create',
      resourceType: 'proposal',
      resourceId: row.id,
      metadata: { source, actorLabel: label },
    })

    return c.json({ data: { id: row.id, status: row.status } }, 201)
  })
}
