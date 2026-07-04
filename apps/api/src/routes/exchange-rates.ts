import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { db, exchangeRates } from '@finance-os/db'
import { desc } from 'drizzle-orm'
import { recordAudit } from '../lib/audit'

const codeSchema = z.string().regex(/^[A-Z_]{3,16}$/, 'Must be 3-16 uppercase letters (or underscore, for asset codes)')

const rateShape = z.object({
  id: z.string().uuid(),
  base: z.string(),
  quote: z.string(),
  rate: z.number(),
  asOf: z.string(),
  source: z.string(),
})

function toResponseShape(row: typeof exchangeRates.$inferSelect) {
  return {
    id: row.id,
    base: row.base,
    quote: row.quote,
    rate: Number(row.rate),
    asOf: row.asOf.toISOString(),
    source: row.source,
  }
}

export function registerExchangeRateRoutes(app: OpenAPIHono) {
  const listRoute = createRoute({
    method: 'get',
    path: '/api/exchange-rates',
    tags: ['exchange-rates'],
    responses: {
      200: {
        description: 'Latest known rate per base/quote pair',
        content: {
          'application/json': {
            schema: z.object({ data: z.array(rateShape) }),
          },
        },
      },
    },
  })

  const createRateRoute = createRoute({
    method: 'post',
    path: '/api/exchange-rates',
    tags: ['exchange-rates'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              base: codeSchema,
              quote: codeSchema,
              rate: z.string().regex(/^\d+(\.\d+)?$/, 'Must be a positive decimal string'),
              asOf: z.string().datetime({ offset: true }).optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Manually recorded exchange rate',
        content: {
          'application/json': {
            schema: z.object({ data: rateShape }),
          },
        },
      },
    },
  })

  app.openapi(listRoute, async (c) => {
    // Any base/quote pair the app has ever recorded, not just EUR-based ones —
    // getLatestRates() (lib/fx.ts) is the EUR-only view used for conversion math.
    const rows = await db.select().from(exchangeRates).orderBy(desc(exchangeRates.asOf))

    const latestByPair = new Map<string, typeof rows[number]>()
    for (const row of rows) {
      const key = `${row.base}:${row.quote}`
      if (!latestByPair.has(key)) latestByPair.set(key, row)
    }

    const data = [...latestByPair.values()]
      .sort((a, b) => `${a.base}${a.quote}`.localeCompare(`${b.base}${b.quote}`))
      .map(toResponseShape)

    return c.json({ data }, 200)
  })

  app.openapi(createRateRoute, async (c) => {
    const user = c.get('user')
    const { base, quote, rate, asOf } = c.req.valid('json')

    const [row] = await db
      .insert(exchangeRates)
      .values({
        base,
        quote,
        rate,
        asOf: asOf ? new Date(asOf) : new Date(),
        source: 'manual',
      })
      .returning()

    await recordAudit({
      actorType: c.get('authMethod') ?? 'user',
      actorId: user.id,
      action: 'exchange_rate.create',
      resourceType: 'exchange_rate',
      resourceId: row.id,
    })

    return c.json({ data: toResponseShape(row) }, 201)
  })
}
