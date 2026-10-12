import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { recordAudit } from '../lib/audit'
import {
  CurrencySettingsError,
  getCurrencySettings,
  listCatalog,
  normalizeDefault,
  updateCurrencySettings,
} from '../lib/currency-settings'
import { ensureCurrencyAsset } from '../split/currencies'

const errorShape = z.object({ error: z.object({ code: z.string(), message: z.string() }) })
const settingsShape = z.object({
  defaultCurrency: z.string(),
  defaultIsExplicit: z.boolean(),
  preferredCurrencies: z.array(z.string()),
  updatedAt: z.string().nullable(),
})
const json = <T extends z.ZodTypeAny>(schema: T) => ({ content: { 'application/json': { schema } } })

/**
 * Account-level currency setup. Reads work for every credential; writes are blocked for read and
 * propose-scoped API keys by the auth middleware (only POST /api/proposals is open to them).
 */
export function registerCurrencySettingsRoutes(app: OpenAPIHono) {
  const getRoute = createRoute({
    method: 'get', path: '/api/settings/currencies', tags: ['settings'],
    responses: { 200: { description: 'Default and preferred currencies of the signed-in account', ...json(z.object({ data: settingsShape })) } },
  })
  const patchRoute = createRoute({
    method: 'patch', path: '/api/settings/currencies', tags: ['settings'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              defaultCurrency: z.string().min(3).max(3).optional(),
              // Hard transport bound; the product limit (after de-duplication) is enforced in the service.
              preferredCurrencies: z.array(z.string().min(3).max(3)).max(100).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: 'Updated settings', ...json(z.object({ data: settingsShape })) },
      422: { description: 'Unsupported currency or too many preferred currencies', ...json(errorShape) },
    },
  })
  const catalogRoute = createRoute({
    method: 'get', path: '/api/currencies', tags: ['settings'],
    responses: {
      200: {
        description: 'Supported currency catalog (ISO codes with names and minor-unit precision)',
        ...json(z.object({ data: z.array(z.object({ code: z.string(), name: z.string(), precision: z.number().int() })) })),
      },
    },
  })
  const assetRoute = createRoute({
    method: 'post', path: '/api/assets/currency', tags: ['settings'],
    request: { body: { content: { 'application/json': { schema: z.object({ code: z.string().min(3).max(3) }) } } } },
    responses: {
      200: { description: 'The currency asset (created on first use; no wallet is created)', ...json(z.object({ data: z.object({ id: z.string().uuid(), code: z.string(), precision: z.number().int() }) })) },
      422: { description: 'Unsupported currency', ...json(errorShape) },
    },
  })

  app.openapi(getRoute, async (c) => c.json({ data: await getCurrencySettings(c.get('user').id) }, 200))

  app.openapi(patchRoute, async (c) => {
    const user = c.get('user')
    try {
      const data = await updateCurrencySettings(user.id, c.req.valid('json'))
      await recordAudit({ actorType: c.get('authMethod') ?? 'user', actorId: user.id, action: 'currency_settings.update', resourceType: 'user', resourceId: user.id })
      return c.json({ data }, 200)
    } catch (err) {
      if (err instanceof CurrencySettingsError) return c.json({ error: { code: err.code, message: err.message } }, 422)
      throw err
    }
  })

  app.openapi(catalogRoute, async (c) => c.json({ data: await listCatalog() }, 200))

  app.openapi(assetRoute, async (c) => {
    try {
      const code = normalizeDefault(c.req.valid('json').code)
      const asset = await ensureCurrencyAsset(code)
      if (!asset) return c.json({ error: { code: 'UNSUPPORTED_CURRENCY', message: 'Unsupported currency' } }, 422)
      return c.json({ data: asset }, 200)
    } catch (err) {
      if (err instanceof CurrencySettingsError) return c.json({ error: { code: err.code, message: err.message } }, 422)
      throw err
    }
  })
}
