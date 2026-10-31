# Importing Data

Finance OS supports importing transaction data from external sources, but the repository does not ship with real exports or statement files. Bring your own data and convert it into the Finance OS transaction model.

## Recommended Approaches

### Option 1: Use the Bulk Create API

For most imports, the easiest path is to transform your source data into the payload expected by `POST /api/transactions/bulk`.

```bash
curl -X POST http://localhost:27032/api/transactions/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "transactions": [
      {
        "transactionDate": "2026-03-01T00:00:00.000Z",
        "type": "expense",
        "description": "Grocery shopping",
        "entries": [{
          "walletId": "your-wallet-id",
          "assetId": "your-asset-id",
          "amount": "-45.50"
        }]
      }
    ]
  }'
```

Use this when:

- you already have a CSV or spreadsheet parser elsewhere
- you want to keep import logic outside the Finance OS repo
- you need a repeatable integration from another service

## Write a Custom Import Script

If your source format needs custom parsing or mapping, create a one-off script in `packages/db/src/` or in a separate private repo.

Typical flow:

1. Parse the source file
2. Resolve wallet IDs and asset IDs
3. Map source rows into Finance OS transaction objects
4. Insert transactions and entries
5. Optionally record the import in `statement_imports`

Example structure:

```typescript
import { db, transactions, transactionEntries, statementImports } from './index'

const rows = parseMySource('my-export.csv')

for (const row of rows) {
  const [txRow] = await db.insert(transactions).values({
    transactionDate: new Date(row.date),
    type: row.amount < 0 ? 'expense' : 'income',
    description: row.description,
  }).returning()

  await db.insert(transactionEntries).values({
    transactionId: txRow.id,
    walletId: row.walletId,
    assetId: row.assetId,
    amount: row.amount.toFixed(8),
  })
}

await db.insert(statementImports).values({
  sourceName: 'Custom Import',
  sourceType: 'csv',
  fileName: 'my-export.csv',
  checksum: 'sha256-hash',
  status: 'imported',
})
```

## Checking Import History

View previous imports:

```bash
curl http://localhost:27032/api/imports
```

Example response:

```json
{
  "data": [
    {
      "id": "...",
      "sourceName": "Custom Import",
      "sourceType": "csv",
      "fileName": "my-export.csv",
      "checksum": "sha256-hash",
      "status": "imported",
      "rawMetadata": {
        "totalRows": 250,
        "imported": 248,
        "skipped": 2,
        "currencies": ["EUR", "USD"]
      },
      "importedAt": "2026-03-15T10:00:00.000Z"
    }
  ]
}
```
