import { beforeEach, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import app from '../app'
import { createTestUser, truncateAll } from './helpers'

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://finance:finance@localhost:27033/finance_os_test'

describe('audit log', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('creating a wallet writes an audit row with the acting user', async () => {
    const { cookie, userId } = await createTestUser(app)
    const assetsRes = await app.request('/api/assets', { headers: { cookie } })
    const { data: assets } = (await assetsRes.json()) as { data: { id: string }[] }
    await app.request('/api/wallets', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Audited', walletType: 'bank', assetId: assets[0].id }),
    })
    const pool = new Pool({ connectionString: TEST_DATABASE_URL })
    const { rows } = await pool.query(
      `SELECT actor_type, actor_id, action, resource_type FROM audit_logs`,
    )
    await pool.end()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      actor_type: 'user',
      actor_id: userId,
      action: 'wallet.create',
      resource_type: 'wallet',
    })
  })
})
