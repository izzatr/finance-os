ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "config_id" varchar(255) DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "start" varchar(50);--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "prefix" varchar(50);--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "reference_id" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "refill_interval" integer;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "refill_amount" integer;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "last_refill_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "rate_limit_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "rate_limit_time_window" integer;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "rate_limit_max" integer;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "request_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "remaining" integer;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "last_request" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "permissions" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "metadata" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_reference_id_users_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_key_reference_idx" ON "api_keys" USING btree ("reference_id");--> statement-breakpoint
ALTER TABLE "api_keys" DROP COLUMN "user_id";