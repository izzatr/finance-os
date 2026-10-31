import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { db, assetPrices, assets } from '@finance-os/db'
import { desc, eq } from 'drizzle-orm'
import { recordAudit } from '../lib/audit'

const currencySchema = z.string().regex(/^[A-Z_]{3,16}$/, 'Must be 3-16 uppercase letters (or underscore, for asset codes)')

const priceShape = z.object({
  id: z.string().uuid(),
  assetId: z.string().uuid(),
  price: z.number(),
  currency: z.string(),
  asOf: z.string(),
  source: z.string(),
})

function toResponseShape(row: typeof assetPrices.$inferSelect) {
  return {
    id: row.id,
    assetId: row.assetId,
    price: Number(row.price),
    currency: row.currency,
    asOf: row.asOf.toISOString(),
    source: row.source,
  }
}

export function registerAssetPriceRoutes(app: OpenAPIHono) {
  const listPricesRoute = createRoute({
    method: 'get',
    path: '/api/asset-prices',
    tags: ['assets'],
    request: {
      query: z.object({ assetId: z.string().uuid() }),
    },
    responses: {
      200: {
        description: 'Price history for an asset, latest first',
        content: {
          'application/json': {
            schema: z.object({ data: z.array(priceShape) }),
          },
        },
      },
    },
  })

  const createPriceRoute = createRoute({
    method: 'post',
    path: '/api/asset-prices',
    tags: ['assets'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              assetId: z.string().uuid(),
              price: z.string().regex(/^\d+(\.\d+)?$/).refine((v) => Number(v) > 0, 'Price must be positive'),
              currency: currencySchema,
              asOf: z.string().datetime().optional(),
              source: z.enum(['manual', 'api']).default('manual'),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Recorded asset price',
        content: {
          'application/json': {
            schema: z.object({ data: priceShape }),
          },
        },
      },
      404: {
        description: 'Asset not found',
        content: {
          'application/json': {
            schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
          },
        },
      },
    },
  })

  app.openapi(listPricesRoute, async (c) => {
    const { assetId } = c.req.valid('query')
    const rows = await db
      .select()
      .from(assetPrices)
      .where(eq(assetPrices.assetId, assetId))
      .orderBy(desc(assetPrices.asOf), desc(assetPrices.createdAt))
    return c.json({ data: rows.map(toResponseShape) }, 200)
  })

  app.openapi(createPriceRoute, async (c) => {
    const user = c.get('user')
    const { assetId, price, currency, asOf, source } = c.req.valid('json')

    const [asset] = await db.select({ id: assets.id }).from(assets).where(eq(assets.id, assetId))
    if (!asset) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Asset not found' } }, 404)
    }

    const [row] = await db
      .insert(assetPrices)
      .values({
        assetId,
        price,
        currency,
        asOf: asOf ? new Date(asOf) : new Date(),
        source,
      })
      .returning()

    await recordAudit({
      actorType: c.get('authMethod') ?? 'user',
      actorId: user.id,
      action: 'asset_price.create',
      resourceType: 'asset_price',
      resourceId: row.id,
    })

    return c.json({ data: toResponseShape(row) }, 201)
  })
}
