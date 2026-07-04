import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { db, categories, people, recurringRules } from '@finance-os/db'
import { nextOccurrences } from '@finance-os/domain'
import type { RecurringSchedule } from '@finance-os/domain'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { recordAudit } from '../lib/audit'
import { userOwnsWallets } from '../lib/create-transaction'

const freqValues = ['daily', 'weekly', 'monthly', 'yearly'] as const
const modeValues = ['auto_post', 'draft'] as const

// NewTransactionInput minus `transactionDate` — the shape stored as `template`.
const templateEntrySchema = z.object({
  walletId: z.string().uuid(),
  assetId: z.string().uuid(),
  amount: z.string().regex(/^-?\d+(\.\d+)?$/),
  notes: z.string().max(500).optional().nullable(),
})

const templateSplitSchema = z.object({
  personId: z.string().uuid(),
  assetId: z.string().uuid().optional(),
  amount: z.string().regex(/^\d+(\.\d+)?$/).refine((v) => Number(v) > 0, 'amount must be positive'),
})

const templateSchema = z.object({
  type: z.enum(['expense', 'income', 'transfer', 'exchange', 'adjustment', 'fee']),
  description: z.string().min(1).max(255),
  notes: z.string().max(1000).optional().nullable(),
  externalRef: z.string().max(255).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  entries: z.array(templateEntrySchema).min(1),
  splits: z.array(templateSplitSchema).optional(),
})

type TemplateInput = z.infer<typeof templateSchema>

const ruleShape = z.object({
  id: z.string().uuid(),
  name: z.string(),
  template: z.record(z.unknown()),
  freq: z.enum(freqValues),
  interval: z.number().int(),
  startAt: z.string(),
  endAt: z.string().nullable(),
  mode: z.enum(modeValues),
  isActive: z.boolean(),
  lastRunAt: z.string().nullable(),
  nextRunAt: z.string(),
  createdAt: z.string(),
})

const errorShape = z.object({ error: z.object({ code: z.string(), message: z.string() }) })

function toResponseShape(row: typeof recurringRules.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    template: row.template,
    freq: row.freq as (typeof freqValues)[number],
    interval: row.interval,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt ? row.endAt.toISOString() : null,
    mode: row.mode,
    isActive: row.isActive,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    nextRunAt: row.nextRunAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }
}

/** Every foreign reference in a rule's template (wallets, category, split people) must
 * belong to the acting user — same 404-on-foreign contract as transaction creation. */
async function validateTemplateOwnership(
  userId: string,
  template: TemplateInput,
): Promise<{ status: 404; code: string; message: string } | null> {
  if (!(await userOwnsWallets(userId, template.entries.map((e) => e.walletId)))) {
    return { status: 404, code: 'NOT_FOUND', message: 'Wallet not found' }
  }

  if (template.categoryId) {
    const [category] = await db.select({ id: categories.id }).from(categories)
      .where(and(eq(categories.id, template.categoryId), eq(categories.userId, userId)))
    if (!category) {
      return { status: 404, code: 'NOT_FOUND', message: 'Category not found' }
    }
  }

  if (template.splits && template.splits.length > 0) {
    const uniqueIds = [...new Set(template.splits.map((s) => s.personId))]
    const owned = await db.select({ id: people.id }).from(people)
      .where(and(inArray(people.id, uniqueIds), eq(people.userId, userId), isNull(people.deletedAt)))
    if (owned.length !== uniqueIds.length) {
      return { status: 404, code: 'NOT_FOUND', message: 'Person not found' }
    }
  }

  return null
}

/** The first *unbooked* occurrence: strictly after lastRunAt, or — when the rule has
 * never run — the first occurrence at all (startAt itself, via the startAt-1ms anchor).
 * Deliberately NOT anchored on `now`: a past-due nextRunAt is correct and means the
 * materializer owes a booking; anchoring on now would silently defer it a full cycle
 * whenever an unrelated field is patched. A future startAt falls out naturally. */
function computeNextRunAt(schedule: RecurringSchedule, lastRunAt: Date | null): Date {
  const anchor = lastRunAt ?? new Date(schedule.startAt.getTime() - 1)
  const [occurrence] = nextOccurrences(schedule, anchor, 1)
  return occurrence ?? schedule.startAt
}

export function registerRecurringRoutes(app: OpenAPIHono) {
  const listRulesRoute = createRoute({
    method: 'get',
    path: '/api/recurring-rules',
    tags: ['recurring-rules'],
    responses: {
      200: {
        description: 'List recurring rules',
        content: { 'application/json': { schema: z.object({ data: z.array(ruleShape) }) } },
      },
    },
  })

  const createRuleRoute = createRoute({
    method: 'post',
    path: '/api/recurring-rules',
    tags: ['recurring-rules'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              name: z.string().min(1).max(120),
              template: templateSchema,
              freq: z.enum(freqValues),
              interval: z.number().int().min(1).default(1),
              startAt: z.string().datetime({ offset: true }),
              endAt: z.string().datetime({ offset: true }).optional().nullable(),
              mode: z.enum(modeValues).default('draft'),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Created recurring rule',
        content: { 'application/json': { schema: z.object({ data: ruleShape }) } },
      },
      404: {
        description: 'Referenced wallet, category, or person not found',
        content: { 'application/json': { schema: errorShape } },
      },
    },
  })

  const patchRuleRoute = createRoute({
    method: 'patch',
    path: '/api/recurring-rules/{id}',
    tags: ['recurring-rules'],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              name: z.string().min(1).max(120).optional(),
              template: templateSchema.optional(),
              freq: z.enum(freqValues).optional(),
              interval: z.number().int().min(1).optional(),
              startAt: z.string().datetime({ offset: true }).optional(),
              endAt: z.string().datetime({ offset: true }).nullable().optional(),
              mode: z.enum(modeValues).optional(),
              isActive: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Updated recurring rule',
        content: { 'application/json': { schema: z.object({ data: ruleShape }) } },
      },
      404: {
        description: 'Rule (or a referenced wallet/category/person) not found',
        content: { 'application/json': { schema: errorShape } },
      },
    },
  })

  const deleteRuleRoute = createRoute({
    method: 'delete',
    path: '/api/recurring-rules/{id}',
    tags: ['recurring-rules'],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: {
        description: 'Deleted recurring rule',
        content: { 'application/json': { schema: z.object({ data: z.object({ id: z.string().uuid() }) }) } },
      },
      404: {
        description: 'Rule not found',
        content: { 'application/json': { schema: errorShape } },
      },
    },
  })

  const previewRuleRoute = createRoute({
    method: 'get',
    path: '/api/recurring-rules/{id}/preview',
    tags: ['recurring-rules'],
    request: {
      params: z.object({ id: z.string().uuid() }),
      query: z.object({ count: z.string().optional() }),
    },
    responses: {
      200: {
        description: 'Upcoming occurrences for this rule',
        content: { 'application/json': { schema: z.object({ data: z.object({ occurrences: z.array(z.string()) }) }) } },
      },
      404: {
        description: 'Rule not found',
        content: { 'application/json': { schema: errorShape } },
      },
    },
  })

  app.openapi(listRulesRoute, async (c) => {
    const user = c.get('user')
    const rows = await db.select().from(recurringRules)
      .where(eq(recurringRules.userId, user.id))
      .orderBy(recurringRules.createdAt)
    return c.json({ data: rows.map(toResponseShape) }, 200)
  })

  app.openapi(createRuleRoute, async (c) => {
    const user = c.get('user')
    const body = c.req.valid('json')

    const ownershipError = await validateTemplateOwnership(user.id, body.template)
    if (ownershipError) {
      return c.json({ error: { code: ownershipError.code, message: ownershipError.message } }, ownershipError.status)
    }

    const schedule: RecurringSchedule = {
      freq: body.freq,
      interval: body.interval,
      startAt: new Date(body.startAt),
      endAt: body.endAt ? new Date(body.endAt) : null,
    }
    const nextRunAt = computeNextRunAt(schedule, null)

    const [row] = await db.insert(recurringRules).values({
      userId: user.id,
      name: body.name,
      template: body.template,
      freq: body.freq,
      interval: body.interval,
      startAt: schedule.startAt,
      endAt: schedule.endAt ?? null,
      mode: body.mode,
      nextRunAt,
    }).returning()

    await recordAudit({
      actorType: c.get('authMethod') ?? 'user',
      actorId: user.id,
      action: 'recurring_rule.create',
      resourceType: 'recurring_rule',
      resourceId: row.id,
    })

    return c.json({ data: toResponseShape(row) }, 201)
  })

  app.openapi(patchRuleRoute, async (c) => {
    const user = c.get('user')
    const { id } = c.req.valid('param')
    const payload = c.req.valid('json')

    const [existing] = await db.select().from(recurringRules)
      .where(and(eq(recurringRules.id, id), eq(recurringRules.userId, user.id)))
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Recurring rule not found' } }, 404)
    }

    if (payload.template) {
      const ownershipError = await validateTemplateOwnership(user.id, payload.template)
      if (ownershipError) {
        return c.json({ error: { code: ownershipError.code, message: ownershipError.message } }, ownershipError.status)
      }
    }

    const schedule: RecurringSchedule = {
      freq: payload.freq ?? (existing.freq as RecurringSchedule['freq']),
      interval: payload.interval ?? existing.interval,
      startAt: payload.startAt ? new Date(payload.startAt) : existing.startAt,
      endAt: payload.endAt !== undefined ? (payload.endAt ? new Date(payload.endAt) : null) : existing.endAt,
    }
    const nextRunAt = computeNextRunAt(schedule, existing.lastRunAt)

    const updateSet: Partial<typeof recurringRules.$inferInsert> = {
      startAt: schedule.startAt,
      endAt: schedule.endAt ?? null,
      freq: schedule.freq,
      interval: schedule.interval,
      nextRunAt,
    }
    if (payload.name !== undefined) updateSet.name = payload.name
    if (payload.template !== undefined) updateSet.template = payload.template
    if (payload.mode !== undefined) updateSet.mode = payload.mode
    if (payload.isActive !== undefined) updateSet.isActive = payload.isActive

    const [row] = await db.update(recurringRules).set(updateSet)
      .where(and(eq(recurringRules.id, id), eq(recurringRules.userId, user.id)))
      .returning()

    if (!row) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Recurring rule not found' } }, 404)
    }

    await recordAudit({
      actorType: c.get('authMethod') ?? 'user',
      actorId: user.id,
      action: 'recurring_rule.update',
      resourceType: 'recurring_rule',
      resourceId: row.id,
    })

    return c.json({ data: toResponseShape(row) }, 200)
  })

  app.openapi(deleteRuleRoute, async (c) => {
    const user = c.get('user')
    const { id } = c.req.valid('param')

    // Rules aren't ledger data — hard delete is fine.
    const [row] = await db.delete(recurringRules)
      .where(and(eq(recurringRules.id, id), eq(recurringRules.userId, user.id)))
      .returning()

    if (!row) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Recurring rule not found' } }, 404)
    }

    await recordAudit({
      actorType: c.get('authMethod') ?? 'user',
      actorId: user.id,
      action: 'recurring_rule.delete',
      resourceType: 'recurring_rule',
      resourceId: row.id,
    })

    return c.json({ data: { id: row.id } }, 200)
  })

  app.openapi(previewRuleRoute, async (c) => {
    const user = c.get('user')
    const { id } = c.req.valid('param')
    const { count } = c.req.valid('query')

    const [row] = await db.select().from(recurringRules)
      .where(and(eq(recurringRules.id, id), eq(recurringRules.userId, user.id)))
    if (!row) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Recurring rule not found' } }, 404)
    }

    const parsedCount = count ? parseInt(count, 10) : 5
    const safeCount = Number.isFinite(parsedCount) && parsedCount > 0 ? Math.min(parsedCount, 100) : 5

    const schedule: RecurringSchedule = {
      freq: row.freq as RecurringSchedule['freq'],
      interval: row.interval,
      startAt: row.startAt,
      endAt: row.endAt,
    }
    const occurrences = nextOccurrences(schedule, new Date(), safeCount)

    return c.json({ data: { occurrences: occurrences.map((d) => d.toISOString()) } }, 200)
  })
}
