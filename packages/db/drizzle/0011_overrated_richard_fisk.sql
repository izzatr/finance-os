CREATE TABLE "exchanges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(120) NOT NULL,
	"mic" varchar(4),
	"timezone" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchanges_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"quantity" numeric(28, 8) NOT NULL,
	"average_cost" numeric(28, 8),
	"cost_currency" varchar(16),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holding_wallet_listing_unique" UNIQUE("wallet_id","listing_id")
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(20) NOT NULL,
	"isin" varchar(12),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"price_date" date NOT NULL,
	"close" numeric(28, 8) NOT NULL,
	"currency" varchar(16) NOT NULL,
	"source" varchar(30) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_price_unique" UNIQUE("listing_id","price_date","source")
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"exchange_id" uuid NOT NULL,
	"symbol" varchar(64) NOT NULL,
	"currency" varchar(16) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_refresh_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"refresh_error" text,
	"next_refresh_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_exchange_symbol_unique" UNIQUE("exchange_id","symbol")
);
--> statement-breakpoint
CREATE TABLE "provider_symbols" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"provider" varchar(30) NOT NULL,
	"symbol" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_symbol_unique" UNIQUE("provider","symbol"),
	CONSTRAINT "listing_provider_unique" UNIQUE("listing_id","provider")
);
--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_prices" ADD CONSTRAINT "listing_prices_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_exchange_id_exchanges_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."exchanges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_symbols" ADD CONSTRAINT "provider_symbols_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exchange_mic_idx" ON "exchanges" USING btree ("mic");--> statement-breakpoint
CREATE INDEX "holding_wallet_idx" ON "holdings" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "holding_listing_idx" ON "holdings" USING btree ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "instrument_isin_unique" ON "instruments" USING btree ("isin") WHERE isin IS NOT NULL;--> statement-breakpoint
CREATE INDEX "listing_price_latest_idx" ON "listing_prices" USING btree ("listing_id","price_date");--> statement-breakpoint
CREATE INDEX "listing_instrument_idx" ON "listings" USING btree ("instrument_id");--> statement-breakpoint
CREATE INDEX "listing_due_idx" ON "listings" USING btree ("is_active","next_refresh_at");