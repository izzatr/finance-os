CREATE TABLE "split_category_icons" (
	"user_id" varchar(255) NOT NULL,
	"slug" varchar(40) NOT NULL,
	"icon" varchar(40) NOT NULL,
	CONSTRAINT "split_category_icons_user_id_slug_pk" PRIMARY KEY("user_id","slug")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "icon" varchar(40);--> statement-breakpoint
ALTER TABLE "split_groups" ADD COLUMN "icon" varchar(40);--> statement-breakpoint
ALTER TABLE "split_category_icons" ADD CONSTRAINT "split_category_icons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;