import { eq } from 'drizzle-orm'
import { db, assets, transactionEntries, transactions, wallets } from './index'

async function seed() {
  await db.insert(assets).values({
    code: 'EUR',
    name: 'Euro',
    type: 'currency',
    precision: 2,
  }).onConflictDoNothing()

  await db.insert(assets).values({
    code: 'USD',
    name: 'US Dollar',
    type: 'currency',
    precision: 2,
  }).onConflictDoNothing()

  await db.insert(assets).values({
    code: 'IDR',
    name: 'Indonesian Rupiah',
    type: 'currency',
    precision: 2,
  }).onConflictDoNothing()

  const [eur] = await db.select().from(assets).where(eq(assets.code, 'EUR'))
  const [usd] = await db.select().from(assets).where(eq(assets.code, 'USD'))
  const [idr] = await db.select().from(assets).where(eq(assets.code, 'IDR'))

  if (!eur || !usd || !idr) {
    throw new Error('Failed to prepare seed assets.')
  }

  const [checkingEur] = await db.insert(wallets).values({
    name: 'Main Checking EUR',
    walletType: 'bank',
    institution: 'Example Bank',
    assetId: eur.id,
  }).returning()

  const [savingsUsd] = await db.insert(wallets).values({
    name: 'Savings USD',
    walletType: 'bank',
    institution: 'Example Bank',
    assetId: usd.id,
  }).returning()

  const [cashIdr] = await db.insert(wallets).values({
    name: 'Cash IDR',
    walletType: 'cash',
    institution: null,
    assetId: idr.id,
  }).returning()

  const [salaryTx] = await db.insert(transactions).values({
    transactionDate: new Date(),
    type: 'income',
    description: 'Sample income payment',
  }).returning()

  await db.insert(transactionEntries).values([
    {
      transactionId: salaryTx.id,
      walletId: checkingEur.id,
      assetId: eur.id,
      amount: '2500.00',
    },
    {
      transactionId: salaryTx.id,
      walletId: savingsUsd.id,
      assetId: usd.id,
      amount: '0.00',
    },
    {
      transactionId: salaryTx.id,
      walletId: cashIdr.id,
      assetId: idr.id,
      amount: '0.00',
    },
  ])

  console.log('Seeded Finance OS with starter assets, wallets, and a sample transaction.')
}

seed()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
