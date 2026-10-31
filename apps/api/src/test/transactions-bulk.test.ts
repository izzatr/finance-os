import { beforeEach, describe, expect, it } from 'vitest'
import app from '../app'
import { createTestUser, truncateAll } from './helpers'

async function getAssetId(cookie: string): Promise<string> {
  const res = await app.request('/api/assets', { headers: { cookie } })
  const { data: assets } = (await res.json()) as { data: { id: string }[] }
  if (!assets[0]) throw new Error('no assets seeded in test DB — check global-setup seeds base assets')
  return assets[0].id
}

async function createWallet(cookie: string, name: string): Promise<{ walletId: string; assetId: string }> {
  const assetId = await getAssetId(cookie)
  const res = await app.request('/api/wallets', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name, walletType: 'bank', assetId }),
  })
  expect(res.status).toBe(201)
  const body = (await res.json()) as { data: { id: string } }
  return { walletId: body.data.id, assetId }
}

describe('bulk transaction creation', () => {
  beforeEach(async () => await truncateAll())

  it('stops at the first invalid item with an error envelope, keeping earlier items committed', async () => {
    const { cookie } = await createTestUser(app)
    const { walletId, assetId } = await createWallet(cookie, 'Main Bank')

    const res = await app.request('/api/transactions/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        transactions: [
          {
            transactionDate: new Date().toISOString(),
            type: 'expense',
            description: 'Groceries',
            entries: [{ walletId, assetId, amount: '-25.00' }],
          },
          {
            transactionDate: new Date().toISOString(),
            type: 'transfer',
            description: 'Broken transfer',
            entries: [{ walletId, assetId, amount: '-10.00' }],
          },
        ],
      }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('INVALID_TRANSFER')

    // Batch is non-atomic across items: item 1 stays committed.
    const list = (await (await app.request('/api/transactions', { headers: { cookie } })).json()) as {
      data: { description: string }[]
    }
    expect(list.data).toHaveLength(1)
    expect(list.data[0].description).toBe('Groceries')
  })
})
