CREATE TYPE "public"."category_type" AS ENUM('income', 'expense', 'transfer');--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "type" "category_type";--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "needs_review" boolean NOT NULL DEFAULT false;--> statement-breakpoint

-- Auto-classify existing categories by majority transaction type.
-- expense/fee -> expense; income -> income; transfer/exchange -> transfer; adjustment ignored.
UPDATE "categories" c SET "type" = sub.majority, "needs_review" = sub.ambiguous
FROM (
  SELECT c2.id,
    COALESCE(
      (SELECT CASE
         WHEN t.type IN ('expense','fee') THEN 'expense'::category_type
         WHEN t.type = 'income' THEN 'income'::category_type
         ELSE 'transfer'::category_type
       END
       FROM "transactions" t
       WHERE t.category_id = c2.id AND t.deleted_at IS NULL AND t.type <> 'adjustment'
       GROUP BY 1 ORDER BY count(*) DESC LIMIT 1),
      'expense'::category_type
    ) AS majority,
    (SELECT count(DISTINCT CASE
         WHEN t.type IN ('expense','fee') THEN 'expense'
         WHEN t.type = 'income' THEN 'income'
         ELSE 'transfer' END) = 0
       OR count(DISTINCT CASE
         WHEN t.type IN ('expense','fee') THEN 'expense'
         WHEN t.type = 'income' THEN 'income'
         ELSE 'transfer' END) > 1
     FROM "transactions" t
     WHERE t.category_id = c2.id AND t.deleted_at IS NULL AND t.type <> 'adjustment') AS ambiguous
  FROM "categories" c2
) sub
WHERE c.id = sub.id;--> statement-breakpoint

ALTER TABLE "categories" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "type" SET DEFAULT 'expense';--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk"
  FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" ("parent_id");
