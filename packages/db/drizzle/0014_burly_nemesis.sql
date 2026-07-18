ALTER TABLE "listings" ADD COLUMN "refresh_lease_owner" varchar(64);--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "refresh_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "history_backfilled_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "listing_lease_idx" ON "listings" USING btree ("is_active","refresh_lease_until");--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_holding_investment_wallet() RETURNS trigger AS $$
BEGIN
  -- Serialize holding creation with wallet type/active/deleted updates.
  PERFORM 1 FROM wallets w WHERE w.id = NEW.wallet_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM wallets w
    WHERE w.id = NEW.wallet_id
      AND w.wallet_type = 'investment'
      AND w.is_active = true
      AND w.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Holdings require an active investment wallet' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
