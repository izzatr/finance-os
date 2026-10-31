CREATE TABLE "asset_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"price" numeric(20, 8) NOT NULL,
	"currency" varchar(16) NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"source" varchar(30) DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base" varchar(16) NOT NULL,
	"quote" varchar(16) NOT NULL,
	"rate" numeric(20, 10) NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"source" varchar(30) DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_base_quote_asof_unique" UNIQUE("base","quote","as_of")
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "unit" varchar(16);--> statement-breakpoint
ALTER TABLE "asset_prices" ADD CONSTRAINT "asset_prices_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_asset_asof_idx" ON "asset_prices" USING btree ("asset_id","as_of");--> statement-breakpoint
CREATE INDEX "rate_quote_asof_idx" ON "exchange_rates" USING btree ("quote","as_of");