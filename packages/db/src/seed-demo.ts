import 'dotenv/config'

import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { asc } from 'drizzle-orm'
import { users } from './auth-schema'
import { assets, transactionEntries, transactions, wallets } from './schema'
import { seedBase } from './seed-base'

const connectionString = process.env.DATABASE_URL ?? 'postgres://finance:finance@localhost:27033/finance_os'
const pool = new Pool({ connectionString })
const db = drizzle(pool)

async function seedDemo() {
  await seedBase()

  // Demo data is per-user: attach everything to the earliest-created user.
  const [owner] = await db.select().from(users).orderBy(asc(users.createdAt)).limit(1)
  if (!owner) {
    throw new Error('No user found. Sign up through the web UI first, then re-run the demo seed.')
  }

  const [eur] = await db.select().from(assets).where(eq(assets.code, 'EUR'))
  const [usd] = await db.select().from(assets).where(eq(assets.code, 'USD'))
  const [idr] = await db.select().from(assets).where(eq(assets.code, 'IDR'))

  if (!eur || !usd || !idr) {
    throw new Error('Failed to prepare demo assets.')
  }

  const [checkingEur] = await db.insert(wallets).values({
    userId: owner.id,
    name: 'Main Checking EUR',
    walletType: 'bank',
    institution: 'Example Bank',
    assetId: eur.id,
  }).returning()

  const [savingsUsd] = await db.insert(wallets).values({
    userId: owner.id,
    name: 'Savings USD',
    walletType: 'bank',
    institution: 'Example Bank',
    assetId: usd.id,
  }).returning()

  const [cashIdr] = await db.insert(wallets).values({
    userId: owner.id,
    name: 'Cash IDR',
    walletType: 'cash',
    institution: null,
    assetId: idr.id,
  }).returning()

  const [salaryTx] = await db.insert(transactions).values({
    userId: owner.id,
    transactionDate: new Date(),
    type: 'income',
    description: 'Sample income payment',
  }).returning()

  await db.insert(transactionEntries).values([
    { transactionId: salaryTx.id, walletId: checkingEur.id, assetId: eur.id, amount: '2500.00' },
    { transactionId: salaryTx.id, walletId: savingsUsd.id, assetId: usd.id, amount: '0.00' },
    { transactionId: salaryTx.id, walletId: cashIdr.id, assetId: idr.id, amount: '0.00' },
  ])

  console.log('Seeded Finance OS with demo wallets and a sample transaction.')
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url)

if (isDirectRun) {
  seedDemo().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
