-- Tenancy: add user_id to core tables with a backfill-safe sequence.
-- Add columns as nullable first
ALTER TABLE "wallets" ADD COLUMN "user_id" varchar(255);--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "user_id" varchar(255);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "user_id" varchar(255);--> statement-breakpoint
ALTER TABLE "statement_imports" ADD COLUMN "user_id" varchar(255);--> statement-breakpoint

-- Backfill to the earliest-created user; refuse to guess if data exists with no user
DO $$
DECLARE owner_id varchar(255);
BEGIN
  SELECT id INTO owner_id FROM "users" ORDER BY "created_at" ASC LIMIT 1;
  IF owner_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM "wallets") OR EXISTS (SELECT 1 FROM "transactions")
       OR EXISTS (SELECT 1 FROM "categories") OR EXISTS (SELECT 1 FROM "statement_imports") THEN
      RAISE EXCEPTION 'Cannot backfill user_id: rows exist but no user does. Sign up / seed a user first, then re-run migrations.';
    END IF;
  ELSE
    UPDATE "wallets" SET "user_id" = owner_id WHERE "user_id" IS NULL;
    UPDATE "categories" SET "user_id" = owner_id WHERE "user_id" IS NULL;
    UPDATE "transactions" SET "user_id" = owner_id WHERE "user_id" IS NULL;
    UPDATE "statement_imports" SET "user_id" = owner_id WHERE "user_id" IS NULL;
  END IF;
END $$;--> statement-breakpoint

-- Now enforce NOT NULL
ALTER TABLE "wallets" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "statement_imports" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint

-- Per-user uniqueness for categories replaces global uniqueness
ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "categories_name_unique";--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "categories_slug_unique";--> statement-breakpoint

-- Foreign keys, indexes, composite uniques
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_imports" ADD CONSTRAINT "statement_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_user_idx" ON "statement_imports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transaction_user_idx" ON "transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wallet_user_idx" ON "wallets" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_name_unique" UNIQUE("user_id","name");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_slug_unique" UNIQUE("user_id","slug");
