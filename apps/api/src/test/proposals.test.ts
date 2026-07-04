import { beforeEach, describe, expect, it } from 'vitest'
import app from '../app'
import { createTestUser, truncateAll } from './helpers'

async function setup(cookie: string) {
  const assetsRes = await app.request('/api/assets', { headers: { cookie } })
  const { data: assets } = (await assetsRes.json()) as { data: { id: string; code: string }[] }
  const eur = assets.find((a) => a.code === 'EUR')!.id
  const walletRes = await app.request('/api/wallets', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name: 'Bank', walletType: 'bank', assetId: eur }),
  })
  const { data: wallet } = (await walletRes.json()) as { data: { id: string } }
  return { eur, walletId: wallet.id }
}

async function createKey(cookie: string, scope: 'read' | 'propose') {
  const res = await app.request('/auth/api-key/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name: `${scope} agent`, metadata: { scope } }),
  })
  const { key } = (await res.json()) as { key: string }
  return key
}

function proposalBody(walletId: string, assetId: string) {
  return JSON.stringify({
    transaction: {
      transactionDate: '2026-07-05T12:00:00.000Z',
      type: 'expense',
      description: 'Agent-proposed coffee',
      entries: [{ walletId, assetId, amount: '-4.50' }],
    },
  })
}

describe('proposal intake', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('propose-scoped keys can file proposals; they land pending with mcp attribution', async () => {
    const { cookie } = await createTestUser(app)
    const { eur, walletId } = await setup(cookie)
    const key = await createKey(cookie, 'propose')

    const res = await app.request('/api/proposals', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key },
      body: proposalBody(walletId, eur),
    })
    expect(res.status).toBe(201)
    const { data } = (await res.json()) as { data: { id: string; status: string } }
    expect(data.status).toBe('pending')

    // shows up in the owner's inbox with the right attribution
    const inbox = await app.request('/api/inbox', { headers: { cookie } })
    const { data: items } = (await inbox.json()) as {
      data: Array<{ id: string; source: string; actorLabel: string; status: string }>
    }
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ source: 'mcp', actorLabel: 'propose agent', status: 'pending' })

    // nothing booked yet
    const txs = await app.request('/api/transactions', { headers: { cookie } })
    expect(((await txs.json()) as { data: unknown[] }).data).toEqual([])

    // owner approves → booked
    const approve = await app.request(`/api/inbox/${data.id}/approve`, { method: 'POST', headers: { cookie } })
    expect(approve.status).toBe(200)
    const after = await app.request('/api/transactions', { headers: { cookie } })
    expect(((await after.json()) as { data: unknown[] }).data).toHaveLength(1)
  })

  it('read-scoped keys cannot file proposals', async () => {
    const { cookie } = await createTestUser(app)
    const { eur, walletId } = await setup(cookie)
    const key = await createKey(cookie, 'read')

    const res = await app.request('/api/proposals', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key },
      body: proposalBody(walletId, eur),
    })
    expect(res.status).toBe(403)
  })

  it('validates the transaction at intake — foreign wallet is rejected', async () => {
    const { cookie } = await createTestUser(app)
    const { eur } = await setup(cookie)
    const key = await createKey(cookie, 'propose')

    const res = await app.request('/api/proposals', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key },
      body: proposalBody('00000000-0000-0000-0000-000000000000', eur),
    })
    expect(res.status).toBe(404)

    const inbox = await app.request('/api/inbox', { headers: { cookie } })
    expect(((await inbox.json()) as { data: unknown[] }).data).toEqual([])
  })
})
