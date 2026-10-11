import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { db, splitUserSettings } from '@finance-os/db'
import { eq } from 'drizzle-orm'
import { getMe, SplitError } from '../split/core'
import { isSupportedCurrency } from '../split/currencies'
import { SHARED_CATEGORIES } from '../split/categories'
import {
  createExpense,
  deleteExpense,
  getExpense,
  listExpenses,
  REPEAT_INTERVALS,
  restoreExpense,
  setMyBooks,
  updateExpense,
} from '../split/expenses'
import {
  addFriend,
  addGroupMember,
  createGroup,
  deleteGroup,
  getBalancesSummary,
  getFriend,
  getGroup,
  GROUP_TYPES,
  listDeletedGroups,
  listFriends,
  listGroups,
  removeFriend,
  removeGroupMember,
  restoreGroup,
  updateGroup,
  updateGuest,
} from '../split/social'
import { addComment, deleteComment, listActivity, listComments, markActivitySeen, unreadActivityCount } from '../split/feed'
import { claimInvite, createInvite, previewInvite } from '../split/invites'
import { adoptWallet, migrateLegacySplits, resyncUserBooks } from '../split/legacy'
import { rateLimit } from '../middleware/rate-limit'
import { bodyLimit } from 'hono/body-limit'

const errorShape = z.object({ error: z.object({ code: z.string(), message: z.string() }) })
const uuid = z.string().uuid()
const amount = z.string().max(24).regex(/^\d{1,12}(\.\d{1,8})?$/, 'Use a plain decimal like 12.50')
const anyData = z.object({ data: z.any() })
/** At most 100 people in any per-person map (Splitwise's own group limit is lower). */
const perPerson = <T extends z.ZodTypeAny>(value: T) => z.record(uuid, value).refine((r) => Object.keys(r).length <= 100, 'Too many people')

const errorResponses = {
  400: { description: 'Bad request', content: { 'application/json': { schema: errorShape } } },
  404: { description: 'Not found', content: { 'application/json': { schema: errorShape } } },
  409: { description: 'Conflict', content: { 'application/json': { schema: errorShape } } },
  422: { description: 'Invalid input', content: { 'application/json': { schema: errorShape } } },
}

const ok = (description: string, schema: z.ZodTypeAny = anyData) => ({ 200: { description, content: { 'application/json': { schema } } }, ...errorResponses })
const created = (description: string) => ({ 201: { description, content: { 'application/json': { schema: z.object({ data: z.object({ id: uuid }) }) } } }, ...errorResponses })
const jsonBody = (schema: z.ZodTypeAny) => ({ body: { content: { 'application/json': { schema } }, required: true } })

const paidSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('single'), personId: uuid }),
  z.object({ kind: z.literal('multiple'), amounts: perPerson(amount) }),
])
const weight = z.string().max(16).regex(/^\d{1,6}(\.\d{1,4})?$/)
const splitSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('equal'), personIds: z.array(uuid).min(1).max(100) }),
  z.object({ method: z.literal('exact'), amounts: perPerson(amount) }),
  z.object({ method: z.literal('percent'), percents: perPerson(weight) }),
  z.object({ method: z.literal('shares'), shares: perPerson(weight) }),
  z.object({ method: z.literal('adjustment'), personIds: z.array(uuid).min(1).max(100), adjustments: perPerson(amount) }),
])
const myBooksSchema = z.object({
  fundingWalletId: uuid.nullable().optional(),
  fundingAmount: amount.nullable().optional(),
  categoryId: uuid.nullable().optional(),
  linkedTransactionId: uuid.nullable().optional(),
})
const expenseSchema = z.object({
  groupId: uuid.nullable().optional(),
  kind: z.enum(['expense', 'payment']).default('expense'),
  description: z.string().max(255).optional(),
  cost: amount,
  currency: z.string().regex(/^[A-Za-z]{3}$/).transform((v) => v.toUpperCase()),
  date: z.string().datetime({ offset: true }),
  category: z.string().max(40).optional(),
  notes: z.string().max(2000).nullable().optional(),
  paid: paidSchema.optional(),
  split: splitSchema.optional(),
  payment: z.object({ fromPersonId: uuid, toPersonId: uuid }).optional(),
  repeatInterval: z.enum(REPEAT_INTERVALS).optional(),
  externalRef: z.string().max(255).nullable().optional(),
  myBooks: myBooksSchema.optional(),
}).openapi('SharedExpenseInput')

type AnyContext = Context

/** User-written text in CSV: neutralise anything a spreadsheet would run as a formula. */
function text(v: string) {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
}

function fail(c: AnyContext, err: unknown) {
  if (err instanceof SplitError) return c.json({ error: { code: err.code, message: err.message } }, err.status) as never
  throw err
}

async function me(c: AnyContext) {
  const user = c.get('user') as { id: string }
  const m = await getMe(user.id)
  return m
}

export function registerSplitPublicRoutes(app: OpenAPIHono) {
  // Public (no session): what an invite link shows before sign-in. Rate limited; minimal data.
  app.use('/api/public/split-invites/*', rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'split-invite' }))
  app.openapi(createRoute({
    method: 'get', path: '/api/public/split-invites/{token}', tags: ['shared'],
    request: { params: z.object({ token: z.string().min(20).max(100) }) },
    responses: ok('Invite preview', z.object({ data: z.object({ status: z.enum(['valid', 'expired', 'claimed', 'revoked']), guestName: z.string(), inviterName: z.string() }) })),
  }), async (c) => {
    try {
      return c.json({ data: await previewInvite(c.req.valid('param').token) }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })
}

export function registerSplitRoutes(app: OpenAPIHono) {
  app.use('/api/split/*', bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.json({ error: { code: 'TOO_LARGE', message: 'Request body too large' } }, 413) }))
  app.use('/api/split/invites/*', rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'split-claim' }))
  app.use('/api/split/persons/*', rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'split-invite-create' }))

  // ---- me
  app.openapi(createRoute({ method: 'get', path: '/api/split/me', tags: ['shared'], responses: ok('My shared-expenses profile, balances summary and unread activity') }), async (c) => {
    try {
      const m = await me(c)
      // The one-time conversion writes data, so a read-only credential never triggers it.
      if (c.get('keyScope') === 'write') await migrateLegacySplits(m)
      return c.json({
        data: {
          personId: m.personId,
          displayName: m.displayName,
          booksStart: m.booksStart.toISOString(),
          defaultCurrency: m.defaultCurrency,
          unreadActivity: await unreadActivityCount(m),
          balances: await getBalancesSummary(m),
          categories: SHARED_CATEGORIES.map(({ slug, label, group }) => ({ slug, label, group })),
        },
      }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'patch', path: '/api/split/me', tags: ['shared'],
    request: jsonBody(z.object({
      defaultCurrency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
      activitySeen: z.boolean().optional(),
      // Shared expenses before this date are carried as one opening balance instead of spending.
      booksStart: z.string().datetime({ offset: true }).optional(),
    })),
    responses: ok('Updated'),
  }), async (c) => {
    try {
      const m = await me(c)
      const body = c.req.valid('json')
      if (body.defaultCurrency) {
        const code = body.defaultCurrency.toUpperCase()
        if (!isSupportedCurrency(code)) throw new SplitError(422, 'UNSUPPORTED_CURRENCY', 'Unsupported currency')
        await db.update(splitUserSettings).set({ defaultCurrency: code }).where(eq(splitUserSettings.userId, m.userId))
      }
      if (body.activitySeen) await markActivitySeen(m)
      if (body.booksStart) {
        const start = new Date(body.booksStart)
        await db.transaction(async (tx) => {
          await tx.update(splitUserSettings).set({ booksStart: start }).where(eq(splitUserSettings.userId, m.userId))
          await resyncUserBooks(tx, m.userId, m.personId)
        })
      }
      return c.json({ data: { ok: true } }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'post', path: '/api/split/me/adopt-wallet', tags: ['shared'],
    request: jsonBody(z.object({ walletId: uuid })),
    responses: ok('An existing wallet becomes your Friends wallet for its currency (for moving over from a hand-kept Splitwise wallet)'),
  }), async (c) => {
    try {
      await adoptWallet(await me(c), c.req.valid('json').walletId)
      return c.json({ data: { ok: true } }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({ method: 'get', path: '/api/split/balances', tags: ['shared'], responses: ok('Totals: what friends owe you and what you owe, per currency') }), async (c) => {
    try {
      return c.json({ data: await getBalancesSummary(await me(c)) }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  // ---- friends
  app.openapi(createRoute({ method: 'get', path: '/api/split/friends', tags: ['shared'], responses: ok('Friends with per-currency balances (positive = they owe you)') }), async (c) => {
    try {
      return c.json({ data: await listFriends(await me(c)) }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'post', path: '/api/split/friends', tags: ['shared'],
    request: jsonBody(z.object({ name: z.string().min(1).max(120), email: z.string().max(255).nullable().optional() })),
    responses: created('Guest friend added'),
  }), async (c) => {
    try {
      const id = await addFriend(await me(c), c.req.valid('json'))
      return c.json({ data: { id } }, 201)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'get', path: '/api/split/friends/{id}', tags: ['shared'],
    request: { params: z.object({ id: uuid }) },
    responses: ok('Friend with balance breakdown by group'),
  }), async (c) => {
    try {
      return c.json({ data: await getFriend(await me(c), c.req.valid('param').id) }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'patch', path: '/api/split/friends/{id}', tags: ['shared'],
    request: { params: z.object({ id: uuid }), ...jsonBody(z.object({ name: z.string().max(120).optional(), email: z.string().max(255).nullable().optional() })) },
    responses: ok('Guest updated (only guests you added)'),
  }), async (c) => {
    try {
      await updateGuest(await me(c), c.req.valid('param').id, c.req.valid('json'))
      return c.json({ data: { ok: true } }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'delete', path: '/api/split/friends/{id}', tags: ['shared'],
    request: { params: z.object({ id: uuid }) },
    responses: ok('Friend removed (only when settled up)'),
  }), async (c) => {
    try {
      await removeFriend(await me(c), c.req.valid('param').id)
      return c.json({ data: { ok: true } }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'post', path: '/api/split/persons/{id}/invite', tags: ['shared'],
    request: { params: z.object({ id: uuid }) },
    responses: ok('Single-use invite link token for a guest (valid 14 days; replaces older links)'),
  }), async (c) => {
    try {
      return c.json({ data: await createInvite(await me(c), c.req.valid('param').id) }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'post', path: '/api/split/invites/{token}/claim', tags: ['shared'],
    request: { params: z.object({ token: z.string().min(20).max(100) }) },
    responses: ok('Invite claimed: the guest history now belongs to you'),
  }), async (c) => {
    try {
      const user = c.get('user') as { id: string }
      if (c.get('authMethod') !== 'user') throw new SplitError(403, 'SESSION_REQUIRED', 'Sign in to accept an invite')
      return c.json({ data: await claimInvite(user.id, c.req.valid('param').token) }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  // ---- groups
  app.openapi(createRoute({ method: 'get', path: '/api/split/groups', tags: ['shared'], responses: ok('Your groups with your balance in each') }), async (c) => {
    try {
      const m = await me(c)
      const deleted = c.req.query('deleted') === 'true'
      return c.json({ data: deleted ? await listDeletedGroups(m) : await listGroups(m) }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'post', path: '/api/split/groups', tags: ['shared'],
    request: jsonBody(z.object({
      name: z.string().min(1).max(120),
      groupType: z.enum(GROUP_TYPES).optional(),
      simplifyDebts: z.boolean().optional(),
      memberIds: z.array(uuid).max(100).optional(),
      externalRef: z.string().max(255).nullable().optional(),
    })),
    responses: created('Group created'),
  }), async (c) => {
    try {
      const id = await createGroup(await me(c), c.req.valid('json'))
      return c.json({ data: { id } }, 201)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'get', path: '/api/split/groups/{id}', tags: ['shared'],
    request: { params: z.object({ id: uuid }) },
    responses: ok('Group with members, balances and suggested settle-ups'),
  }), async (c) => {
    try {
      return c.json({ data: await getGroup(await me(c), c.req.valid('param').id) }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'patch', path: '/api/split/groups/{id}', tags: ['shared'],
    request: { params: z.object({ id: uuid }), ...jsonBody(z.object({ name: z.string().max(120).optional(), groupType: z.enum(GROUP_TYPES).optional(), simplifyDebts: z.boolean().optional() })) },
    responses: ok('Group updated'),
  }), async (c) => {
    try {
      await updateGroup(await me(c), c.req.valid('param').id, c.req.valid('json'))
      return c.json({ data: { ok: true } }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'delete', path: '/api/split/groups/{id}', tags: ['shared'],
    request: { params: z.object({ id: uuid }) },
    responses: ok('Group and its expenses deleted (restorable)'),
  }), async (c) => {
    try {
      await deleteGroup(await me(c), c.req.valid('param').id)
      return c.json({ data: { ok: true } }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'post', path: '/api/split/groups/{id}/restore', tags: ['shared'],
    request: { params: z.object({ id: uuid }) },
    responses: ok('Group restored'),
  }), async (c) => {
    try {
      await restoreGroup(await me(c), c.req.valid('param').id)
      return c.json({ data: { ok: true } }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'post', path: '/api/split/groups/{id}/members', tags: ['shared'],
    request: { params: z.object({ id: uuid }), ...jsonBody(z.object({ personId: uuid.optional(), name: z.string().max(120).optional(), email: z.string().max(255).nullable().optional() })) },
    responses: created('Member added (existing friend or new guest)'),
  }), async (c) => {
    try {
      const id = await addGroupMember(await me(c), c.req.valid('param').id, c.req.valid('json'))
      return c.json({ data: { id } }, 201)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'delete', path: '/api/split/groups/{id}/members/{personId}', tags: ['shared'],
    request: { params: z.object({ id: uuid, personId: uuid }) },
    responses: ok('Member removed or left (only when settled up in this group)'),
  }), async (c) => {
    try {
      const { id, personId } = c.req.valid('param')
      await removeGroupMember(await me(c), id, personId)
      return c.json({ data: { ok: true } }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'get', path: '/api/split/groups/{id}/export.csv', tags: ['shared'],
    request: { params: z.object({ id: uuid }) },
    responses: { 200: { description: 'CSV export', content: { 'text/csv': { schema: z.string() } } }, ...errorResponses },
  }), async (c) => {
    try {
      const m = await me(c)
      const { id } = c.req.valid('param')
      const group = await getGroup(m, id)
      const rows: string[][] = []
      const minor = (v: string, p: number) => {
        const [w, f = ''] = v.replace(/^-/, '').split('.')
        const n = BigInt(w) * 10n ** BigInt(p) + BigInt((f + '0'.repeat(p)).slice(0, p) || '0')
        return v.startsWith('-') ? -n : n
      }
      const fmt = (n: bigint, p: number) => {
        const neg = n < 0n
        const a = neg ? -n : n
        const s = p === 0 ? `${a}` : `${a / 10n ** BigInt(p)}.${(a % 10n ** BigInt(p)).toString().padStart(p, '0')}`
        return neg ? `-${s}` : s
      }
      let before: { date: string; id: string } | undefined
      for (let i = 0; i < 1000; i++) {
        const page = await listExpenses(m, { groupId: id, limit: 100, before })
        for (const e of page.data) {
          const p = (e.cost.split('.')[1] ?? '').length
          rows.push([e.date.slice(0, 10), text(e.description), e.kind === 'payment' ? 'Payment' : e.category, e.cost, e.currency,
            ...group.members.map((mem) => {
              const s = e.shares.find((x) => x.personId === mem.personId)
              return s ? fmt(minor(s.paid, p) - minor(s.owed, p), p) : fmt(0n, p)
            })])
        }
        if (!page.next) break
        before = page.next
      }
      const quote = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
      const header = ['Date', 'Description', 'Category', 'Cost', 'Currency', ...group.members.map((mem) => text(mem.name))]
      const csv = [header, ...rows.reverse()].map((r) => r.map(quote).join(',')).join('\r\n')
      const filename = `${group.name.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'group'}.csv`
      return c.body(csv, 200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"` }) as never
    } catch (err) {
      return fail(c, err)
    }
  })

  // ---- expenses
  app.openapi(createRoute({
    method: 'get', path: '/api/split/expenses', tags: ['shared'],
    request: {
      query: z.object({
        groupId: uuid.optional(),
        friendId: uuid.optional(),
        q: z.string().max(100).optional(),
        beforeDate: z.string().datetime({ offset: true }).optional(),
        beforeId: uuid.optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        includeDeleted: z.enum(['true', 'false']).optional(),
      }),
    },
    responses: ok('Expenses and payments you can see, newest first (cursor pagination)'),
  }), async (c) => {
    try {
      const q = c.req.valid('query')
      const result = await listExpenses(await me(c), {
        groupId: q.groupId,
        friendId: q.friendId,
        q: q.q,
        before: q.beforeDate && q.beforeId ? { date: q.beforeDate, id: q.beforeId } : undefined,
        limit: q.limit ?? 30,
        includeDeleted: q.includeDeleted === 'true',
      })
      return c.json(result, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'post', path: '/api/split/expenses', tags: ['shared'],
    request: jsonBody(expenseSchema),
    responses: created('Expense or payment recorded'),
  }), async (c) => {
    try {
      const id = await createExpense(await me(c), c.req.valid('json'))
      return c.json({ data: { id } }, 201)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'get', path: '/api/split/expenses/{id}', tags: ['shared'],
    request: { params: z.object({ id: uuid }) },
    responses: ok('One expense with shares and your bookkeeping'),
  }), async (c) => {
    try {
      return c.json({ data: await getExpense(await me(c), c.req.valid('param').id) }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'patch', path: '/api/split/expenses/{id}', tags: ['shared'],
    request: { params: z.object({ id: uuid }), ...jsonBody(expenseSchema.and(z.object({ version: z.number().int() }))) },
    responses: ok('Expense updated (send the version you edited to avoid overwriting someone else)'),
  }), async (c) => {
    try {
      await updateExpense(await me(c), c.req.valid('param').id, c.req.valid('json'))
      return c.json({ data: { ok: true } }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'delete', path: '/api/split/expenses/{id}', tags: ['shared'],
    request: { params: z.object({ id: uuid }) },
    responses: ok('Expense deleted (restorable)'),
  }), async (c) => {
    try {
      await deleteExpense(await me(c), c.req.valid('param').id)
      return c.json({ data: { ok: true } }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'post', path: '/api/split/expenses/{id}/restore', tags: ['shared'],
    request: { params: z.object({ id: uuid }) },
    responses: ok('Expense restored'),
  }), async (c) => {
    try {
      await restoreExpense(await me(c), c.req.valid('param').id)
      return c.json({ data: { ok: true } }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'put', path: '/api/split/expenses/{id}/my-books', tags: ['shared'],
    request: { params: z.object({ id: uuid }), ...jsonBody(myBooksSchema) },
    responses: ok('Your private bookkeeping for this expense updated'),
  }), async (c) => {
    try {
      await setMyBooks(await me(c), c.req.valid('param').id, c.req.valid('json'))
      return c.json({ data: { ok: true } }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'get', path: '/api/split/expenses/{id}/comments', tags: ['shared'],
    request: { params: z.object({ id: uuid }) },
    responses: ok('Comments, oldest first'),
  }), async (c) => {
    try {
      return c.json({ data: await listComments(await me(c), c.req.valid('param').id) }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'post', path: '/api/split/expenses/{id}/comments', tags: ['shared'],
    request: { params: z.object({ id: uuid }), ...jsonBody(z.object({ body: z.string().min(1).max(1000) })) },
    responses: created('Comment added'),
  }), async (c) => {
    try {
      const id = await addComment(await me(c), c.req.valid('param').id, c.req.valid('json').body)
      return c.json({ data: { id } }, 201)
    } catch (err) {
      return fail(c, err)
    }
  })

  app.openapi(createRoute({
    method: 'delete', path: '/api/split/comments/{id}', tags: ['shared'],
    request: { params: z.object({ id: uuid }) },
    responses: ok('Comment deleted'),
  }), async (c) => {
    try {
      await deleteComment(await me(c), c.req.valid('param').id)
      return c.json({ data: { ok: true } }, 200)
    } catch (err) {
      return fail(c, err)
    }
  })

  // ---- activity
  app.openapi(createRoute({
    method: 'get', path: '/api/split/activity', tags: ['shared'],
    request: { query: z.object({ groupId: uuid.optional(), beforeAt: z.string().datetime({ offset: true }).optional(), beforeId: uuid.optional(), limit: z.coerce.number().int().min(1).max(100).optional() }) },
    responses: ok('Activity feed, newest first'),
  }), async (c) => {
    try {
      const q = c.req.valid('query')
      return c.json(await listActivity(await me(c), {
        groupId: q.groupId,
        before: q.beforeAt && q.beforeId ? { at: q.beforeAt, id: q.beforeId } : undefined,
        limit: q.limit ?? 30,
      }), 200)
    } catch (err) {
      return fail(c, err)
    }
  })
}
