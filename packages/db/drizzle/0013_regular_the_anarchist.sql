CREATE TABLE "holding_position_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"quantity" numeric(28, 8) NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holding_event_quantity_non_negative" CHECK ("holding_position_events"."quantity" >= 0)
);
--> statement-breakpoint
ALTER TABLE "holding_position_events" ADD CONSTRAINT "holding_position_events_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_position_events" ADD CONSTRAINT "holding_position_events_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "holding_event_wallet_effective_idx" ON "holding_position_events" USING btree ("wallet_id","effective_at");--> statement-breakpoint
CREATE INDEX "holding_event_listing_effective_idx" ON "holding_position_events" USING btree ("listing_id","effective_at");--> statement-breakpoint
INSERT INTO "holding_position_events" ("wallet_id", "listing_id", "quantity", "effective_at", "reason")
SELECT "wallet_id", "listing_id", "quantity", "created_at", 'created' FROM "holdings";--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_holding_investment_wallet() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
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
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER holding_active_investment_wallet
BEFORE INSERT OR UPDATE OF wallet_id ON holdings
FOR EACH ROW EXECUTE FUNCTION enforce_holding_investment_wallet();--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_wallet_from_invalidating_holdings() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM holdings h WHERE h.wallet_id = NEW.id)
     AND (NEW.wallet_type <> 'investment' OR NEW.is_active = false OR NEW.deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Remove investment holdings before changing or deleting this wallet' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER wallet_preserve_holding_invariant
BEFORE UPDATE OF wallet_type, is_active, deleted_at ON wallets
FOR EACH ROW EXECUTE FUNCTION prevent_wallet_from_invalidating_holdings();
