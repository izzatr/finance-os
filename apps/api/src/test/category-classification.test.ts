import { describe, expect, it } from 'vitest'
import { Pool } from 'pg'

const url = process.env.DATABASE_URL ?? 'postgres://finance:finance@localhost:27033/finance_os_test'

describe('category schema (0006)', () => {
  it('has type/parent_id/needs_review columns with expected defaults', async () => {
    const pool = new Pool({ connectionString: url })
    const { rows } = await pool.query(`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'categories' AND column_name IN ('type','parent_id','needs_review')
      ORDER BY column_name`)
    await pool.end()
    expect(rows).toHaveLength(3)
    const byName = Object.fromEntries(rows.map((r) => [r.column_name, r]))
    expect(byName.type.is_nullable).toBe('NO')
    expect(byName.parent_id.is_nullable).toBe('YES')
    expect(byName.needs_review.column_default).toBe('false')
  })
})
