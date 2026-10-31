CREATE TYPE "public"."split_expense_kind" AS ENUM('expense', 'payment');--> statement-breakpoint
CREATE TYPE "public"."split_group_type" AS ENUM('home', 'trip', 'couple', 'other');--> statement-breakpoint
CREATE TABLE "split_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_person_id" uuid,
	"kind" varchar(40) NOT NULL,
	"group_id" uuid,
	"expense_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"audience" uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "split_expense_books" (
	"expense_id" uuid NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"funding_wallet_id" uuid,
	"funding_amount" numeric(20, 8),
	"category_id" uuid,
	"linked_transaction_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "split_expense_books_expense_id_user_id_pk" PRIMARY KEY("expense_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "split_expense_debts" (
	"expense_id" uuid NOT NULL,
	"from_person_id" uuid NOT NULL,
	"to_person_id" uuid NOT NULL,
	"group_id" uuid,
	"asset_id" uuid NOT NULL,
	"amount" numeric(20, 8) NOT NULL,
	CONSTRAINT "split_expense_debts_expense_id_from_person_id_to_person_id_pk" PRIMARY KEY("expense_id","from_person_id","to_person_id"),
	CONSTRAINT "split_debt_positive" CHECK (amount > 0 AND from_person_id <> to_person_id)
);
--> statement-breakpoint
CREATE TABLE "split_expense_shares" (
	"expense_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"paid_share" numeric(20, 8) NOT NULL,
	"owed_share" numeric(20, 8) NOT NULL,
	CONSTRAINT "split_expense_shares_expense_id_person_id_pk" PRIMARY KEY("expense_id","person_id"),
	CONSTRAINT "split_share_non_negative" CHECK (paid_share >= 0 AND owed_share >= 0)
);
--> statement-breakpoint
CREATE TABLE "split_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid,
	"kind" "split_expense_kind" DEFAULT 'expense' NOT NULL,
	"description" varchar(255) NOT NULL,
	"cost" numeric(20, 8) NOT NULL,
	"asset_id" uuid NOT NULL,
	"expense_date" timestamp with time zone NOT NULL,
	"category" varchar(40) DEFAULT 'general' NOT NULL,
	"notes" text,
	"split_method" varchar(20) NOT NULL,
	"split_input" jsonb,
	"paid_input" jsonb,
	"repeat_interval" varchar(12) DEFAULT 'never' NOT NULL,
	"next_repeat_at" timestamp with time zone,
	"created_by_person_id" uuid NOT NULL,
	"updated_by_person_id" uuid,
	"external_ref" varchar(255),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by_person_id" uuid,
	CONSTRAINT "split_expense_cost_positive" CHECK (cost > 0),
	CONSTRAINT "split_expense_repeat_valid" CHECK (repeat_interval IN ('never','weekly','fortnightly','monthly','yearly'))
);
--> statement-breakpoint
CREATE TABLE "split_friendships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_low_id" uuid NOT NULL,
	"person_high_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "split_friend_pair_unique" UNIQUE("person_low_id","person_high_id"),
	CONSTRAINT "split_friend_order" CHECK (person_low_id < person_high_id)
);
--> statement-breakpoint
CREATE TABLE "split_group_members" (
	"group_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"added_by_person_id" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "split_group_members_group_id_person_id_pk" PRIMARY KEY("group_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "split_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"group_type" "split_group_type" DEFAULT 'other' NOT NULL,
	"simplify_debts" boolean DEFAULT true NOT NULL,
	"created_by_person_id" uuid NOT NULL,
	"external_ref" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by_person_id" uuid
);
--> statement-breakpoint
CREATE TABLE "split_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"person_id" uuid NOT NULL,
	"created_by_user_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by_user_id" varchar(255),
	"revoked_at" timestamp with time zone,
	CONSTRAINT "split_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "split_persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255),
	"display_name" varchar(120) NOT NULL,
	"email" varchar(255),
	"created_by_user_id" varchar(255),
	"merged_into_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_user_settings" (
	"user_id" varchar(255) PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"books_start" timestamp with time zone NOT NULL,
	"default_currency" varchar(16) DEFAULT 'EUR' NOT NULL,
	"activity_seen_at" timestamp with time zone,
	"legacy_migrated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "managed_by" varchar(20);--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "system_role" varchar(20);--> statement-breakpoint
ALTER TABLE "split_activity" ADD CONSTRAINT "split_activity_actor_person_id_split_persons_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."split_persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_activity" ADD CONSTRAINT "split_activity_group_id_split_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."split_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_activity" ADD CONSTRAINT "split_activity_expense_id_split_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."split_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_comments" ADD CONSTRAINT "split_comments_expense_id_split_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."split_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_comments" ADD CONSTRAINT "split_comments_person_id_split_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."split_persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_expense_books" ADD CONSTRAINT "split_expense_books_expense_id_split_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."split_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_expense_books" ADD CONSTRAINT "split_expense_books_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_expense_books" ADD CONSTRAINT "split_expense_books_funding_wallet_id_wallets_id_fk" FOREIGN KEY ("funding_wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_expense_books" ADD CONSTRAINT "split_expense_books_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_expense_books" ADD CONSTRAINT "split_expense_books_linked_transaction_id_transactions_id_fk" FOREIGN KEY ("linked_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_expense_debts" ADD CONSTRAINT "split_expense_debts_expense_id_split_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."split_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_expense_debts" ADD CONSTRAINT "split_expense_debts_from_person_id_split_persons_id_fk" FOREIGN KEY ("from_person_id") REFERENCES "public"."split_persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_expense_debts" ADD CONSTRAINT "split_expense_debts_to_person_id_split_persons_id_fk" FOREIGN KEY ("to_person_id") REFERENCES "public"."split_persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_expense_debts" ADD CONSTRAINT "split_expense_debts_group_id_split_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."split_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_expense_debts" ADD CONSTRAINT "split_expense_debts_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_expense_shares" ADD CONSTRAINT "split_expense_shares_expense_id_split_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."split_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_expense_shares" ADD CONSTRAINT "split_expense_shares_person_id_split_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."split_persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_expenses" ADD CONSTRAINT "split_expenses_group_id_split_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."split_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_expenses" ADD CONSTRAINT "split_expenses_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_expenses" ADD CONSTRAINT "split_expenses_created_by_person_id_split_persons_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."split_persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_expenses" ADD CONSTRAINT "split_expenses_updated_by_person_id_split_persons_id_fk" FOREIGN KEY ("updated_by_person_id") REFERENCES "public"."split_persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_expenses" ADD CONSTRAINT "split_expenses_deleted_by_person_id_split_persons_id_fk" FOREIGN KEY ("deleted_by_person_id") REFERENCES "public"."split_persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_friendships" ADD CONSTRAINT "split_friendships_person_low_id_split_persons_id_fk" FOREIGN KEY ("person_low_id") REFERENCES "public"."split_persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_friendships" ADD CONSTRAINT "split_friendships_person_high_id_split_persons_id_fk" FOREIGN KEY ("person_high_id") REFERENCES "public"."split_persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_group_members" ADD CONSTRAINT "split_group_members_group_id_split_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."split_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_group_members" ADD CONSTRAINT "split_group_members_person_id_split_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."split_persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_group_members" ADD CONSTRAINT "split_group_members_added_by_person_id_split_persons_id_fk" FOREIGN KEY ("added_by_person_id") REFERENCES "public"."split_persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_groups" ADD CONSTRAINT "split_groups_created_by_person_id_split_persons_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."split_persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_groups" ADD CONSTRAINT "split_groups_deleted_by_person_id_split_persons_id_fk" FOREIGN KEY ("deleted_by_person_id") REFERENCES "public"."split_persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_invites" ADD CONSTRAINT "split_invites_person_id_split_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."split_persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_invites" ADD CONSTRAINT "split_invites_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_invites" ADD CONSTRAINT "split_invites_claimed_by_user_id_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_persons" ADD CONSTRAINT "split_persons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_persons" ADD CONSTRAINT "split_persons_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_user_settings" ADD CONSTRAINT "split_user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_user_settings" ADD CONSTRAINT "split_user_settings_person_id_split_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."split_persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "split_activity_audience_idx" ON "split_activity" USING gin ("audience");--> statement-breakpoint
CREATE INDEX "split_activity_created_idx" ON "split_activity" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "split_comment_expense_idx" ON "split_comments" USING btree ("expense_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "split_books_linked_unique" ON "split_expense_books" USING btree ("user_id","linked_transaction_id") WHERE linked_transaction_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "split_debt_from_idx" ON "split_expense_debts" USING btree ("from_person_id");--> statement-breakpoint
CREATE INDEX "split_debt_to_idx" ON "split_expense_debts" USING btree ("to_person_id");--> statement-breakpoint
CREATE INDEX "split_debt_group_idx" ON "split_expense_debts" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "split_share_person_idx" ON "split_expense_shares" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "split_expense_group_date_idx" ON "split_expenses" USING btree ("group_id","expense_date");--> statement-breakpoint
CREATE INDEX "split_expense_repeat_idx" ON "split_expenses" USING btree ("next_repeat_at") WHERE next_repeat_at IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "split_expense_external_unique" ON "split_expenses" USING btree ("created_by_person_id","external_ref") WHERE external_ref IS NOT NULL;--> statement-breakpoint
CREATE INDEX "split_friend_high_idx" ON "split_friendships" USING btree ("person_high_id");--> statement-breakpoint
CREATE INDEX "split_member_person_idx" ON "split_group_members" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "split_group_external_unique" ON "split_groups" USING btree ("created_by_person_id","external_ref") WHERE external_ref IS NOT NULL;--> statement-breakpoint
CREATE INDEX "split_invite_person_idx" ON "split_invites" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "split_person_user_unique" ON "split_persons" USING btree ("user_id") WHERE user_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "split_person_creator_idx" ON "split_persons" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_managed_ref_unique" ON "transactions" USING btree ("user_id","external_ref") WHERE managed_by IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_split_unique" ON "wallets" USING btree ("user_id","asset_id") WHERE system_role = 'split' AND deleted_at IS NULL;--> statement-breakpoint
ALTER TABLE "split_persons" ADD CONSTRAINT "split_persons_merged_into_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."split_persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- A live expense's shares must add up to its cost on both sides. Checked at commit so a write can
-- replace shares row by row inside one transaction.
CREATE OR REPLACE FUNCTION split_check_expense_balanced() RETURNS trigger AS $$
DECLARE
  eid uuid;
  e_cost numeric;
  e_deleted timestamptz;
  s_paid numeric;
  s_owed numeric;
BEGIN
  IF TG_TABLE_NAME = 'split_expenses' THEN
    eid := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    eid := OLD.expense_id;
  ELSE
    eid := NEW.expense_id;
  END IF;
  SELECT cost, deleted_at INTO e_cost, e_deleted FROM split_expenses WHERE id = eid;
  IF NOT FOUND OR e_deleted IS NOT NULL THEN
    RETURN NULL;
  END IF;
  SELECT coalesce(sum(paid_share), 0), coalesce(sum(owed_share), 0) INTO s_paid, s_owed
    FROM split_expense_shares WHERE expense_id = eid;
  IF s_paid <> e_cost OR s_owed <> e_cost THEN
    RAISE EXCEPTION 'split expense % is unbalanced: cost %, paid %, owed %', eid, e_cost, s_paid, s_owed
      USING ERRCODE = '23514', CONSTRAINT = 'split_expense_balanced';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER split_shares_balanced
  AFTER INSERT OR UPDATE OR DELETE ON split_expense_shares
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION split_check_expense_balanced();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER split_expense_balanced
  AFTER INSERT OR UPDATE ON split_expenses
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION split_check_expense_balanced();
