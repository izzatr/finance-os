import { db, assets, statementImports, transactionEntries, transactions, wallets } from '@finance-os/db'

export async function getWalletBalances() {
  const allWallets = await db.select().from(wallets)
  const allEntries = await db.select().from(transactionEntries)

  return allWallets.map((wallet) => {
    const matchingEntries = allEntries.filter((entry) => entry.walletId === wallet.id)
    const balance = matchingEntries.reduce((sum, entry) => sum + Number(entry.amount), 0)
    return {
      ...wallet,
      balance,
    }
  })
}

export async function getDashboardSnapshot() {
  const [walletCount] = await db.select({ count: wallets.id }).from(wallets)
  const [assetCount] = await db.select({ count: assets.id }).from(assets)
  const [transactionCount] = await db.select({ count: transactions.id }).from(transactions)
  const [importCount] = await db.select({ count: statementImports.id }).from(statementImports)

  return {
    walletCount: walletCount?.count ?? 0,
    assetCount: assetCount?.count ?? 0,
    transactionCount: transactionCount?.count ?? 0,
    importCount: importCount?.count ?? 0,
  }
}
