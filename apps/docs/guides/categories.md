# Categories

Categories organize transactions by type of spending or income. Finance OS supports creating categories via the API and using them consistently across analytics, search, and reporting.

## Common Categories

A typical setup includes categories like these:

| Category            | Slug                  | Typical Type |
|--------------------|-----------------------|--------------|
| Food & Beverage    | `food-and-beverage`   | expense      |
| Groceries          | `groceries`           | expense      |
| Transportation     | `transportation`      | expense      |
| Restaurants        | `restaurants`         | expense      |
| Shopping           | `shopping`            | expense      |
| Health & Fitness   | `health-and-fitness`  | expense      |
| Personal Care      | `personal-care`       | expense      |
| Education          | `education`           | expense      |
| Entertainment      | `entertainment`       | expense      |
| Travel             | `travel`              | expense      |
| Electronics        | `electronics`         | expense      |
| Cafe               | `cafe`                | expense      |
| Salary             | `salary`              | income       |
| Interest Income    | `interest-income`     | income       |
| Investment         | `investment`          | adjustment   |
| Investment Result  | `investment-result`   | adjustment   |
| Fees & Charges     | `fees-and-charges`    | fee          |
| Internal Transfer  | `internal-transfer`   | transfer     |
| Outgoing Transfer  | `outgoing-transfer`   | transfer     |

## Slugs

Slugs are auto-generated from the category name using this logic:

1. Lowercase the name
2. Replace `&` with `and`
3. Replace non-alphanumeric characters with hyphens
4. Trim leading and trailing hyphens

For example: `"Food & Beverage"` becomes `"food-and-beverage"`.

Slugs are unique and can be used as stable identifiers alongside UUIDs.

## Schema

```typescript
categories = pgTable('categories', {
  id:        uuid('id').defaultRandom().primaryKey(),
  name:      varchar('name', { length: 120 }).notNull().unique(),
  slug:      varchar('slug', { length: 120 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

## Listing Categories

```bash
curl http://localhost:27032/api/categories
```

Response:

```json
{
  "data": [
    { "id": "523d3efc-...", "name": "Cafe", "slug": "cafe" },
    { "id": "53aa7cd8-...", "name": "Electronics", "slug": "electronics" },
    { "id": "d575d5d3-...", "name": "Food & Beverage", "slug": "food-and-beverage" },
    { "id": "f3911035-...", "name": "Groceries", "slug": "groceries" }
  ]
}
```

Categories are returned sorted alphabetically by name.

## Creating a Category

```bash
curl -X POST http://localhost:27032/api/categories \
  -H "Content-Type: application/json" \
  -d '{ "name": "Subscriptions" }'
```

Response:

```json
{
  "data": {
    "id": "a1b2c3d4-...",
    "name": "Subscriptions",
    "slug": "subscriptions"
  }
}
```

If a category with the same slug already exists, the existing category is returned instead of creating a duplicate.

## Updating a Category

```bash
curl -X PATCH http://localhost:27032/api/categories/{id} \
  -H "Content-Type: application/json" \
  -d '{ "name": "Monthly Subscriptions" }'
```

The slug is regenerated automatically when the name changes.

## Category Breakdown Analytics

The analytics endpoint shows spending totals per category, grouped by transaction type and currency:

```bash
curl http://localhost:27032/api/analytics/category-breakdown
```

Response:

```json
{
  "data": [
    {
      "categoryId": "f3911035-...",
      "categoryName": "Groceries",
      "categorySlug": "groceries",
      "total": 243.65,
      "count": 12,
      "type": "expense",
      "currency": "EUR"
    },
    {
      "categoryId": "c7fd1a8f-...",
      "categoryName": "Transportation",
      "categorySlug": "transportation",
      "total": 87.23,
      "count": 15,
      "type": "expense",
      "currency": "EUR"
    }
  ]
}
```

Results are sorted by total amount (descending). You can filter by date range with `?from=2026-03-01&to=2026-03-31`.

## Using Categories with Transactions

When creating transactions, categories are not part of the request body. Categories are assigned to existing transactions via the PATCH endpoint:

```bash
curl -X PATCH http://localhost:27032/api/transactions/{id} \
  -H "Content-Type: application/json" \
  -d '{ "categoryId": "f3911035-a4a7-4513-81ab-41062c977b61" }'
```

Set `categoryId` to `null` to remove a category assignment.
