CREATE TABLE "user_currency_settings" (
	"user_id" varchar(255) PRIMARY KEY NOT NULL,
	"default_currency" varchar(3),
	"preferred_currencies" varchar(3)[] DEFAULT '{}'::varchar[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_currency_default_format" CHECK ("user_currency_settings"."default_currency" IS NULL OR "user_currency_settings"."default_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "user_currency_preferred_format" CHECK (array_to_string("user_currency_settings"."preferred_currencies", ',') ~ '^([A-Z]{3}(,[A-Z]{3})*)?$'),
	CONSTRAINT "user_currency_preferred_bound" CHECK (cardinality("user_currency_settings"."preferred_currencies") <= 20)
);
--> statement-breakpoint
ALTER TABLE "user_currency_settings" ADD CONSTRAINT "user_currency_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;