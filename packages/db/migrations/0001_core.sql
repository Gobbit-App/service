CREATE TYPE "public"."category_visibility" AS ENUM('private', 'shared', 'public');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('proposed', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."item_type" AS ENUM('text', 'link', 'image', 'table', 'calc');--> statement-breakpoint
CREATE TYPE "public"."deck_kind" AS ENUM('personal', 'shared', 'communal');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('manual', 'link', 'share', 'email', 'telegram', 'import');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "users_accountId_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE "decks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "deck_kind" NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deck_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"visibility" "category_visibility" DEFAULT 'shared' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "categories_id_deck_uq" UNIQUE("id","deck_id")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deck_id" uuid NOT NULL,
	"type" "item_type" NOT NULL,
	"status" "item_status" DEFAULT 'published' NOT NULL,
	"title" varchar(120) NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_url" text,
	"source_kind" "source_kind" DEFAULT 'manual' NOT NULL,
	"verified_at" timestamp (3) with time zone,
	"created_by" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "items_id_deck_uq" UNIQUE("id","deck_id")
);
--> statement-breakpoint
CREATE TABLE "item_categories" (
	"item_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"deck_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_categories_item_id_category_id_pk" PRIMARY KEY("item_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_owner_account_id_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_item_fk" FOREIGN KEY ("item_id","deck_id") REFERENCES "public"."items"("id","deck_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_category_fk" FOREIGN KEY ("category_id","deck_id") REFERENCES "public"."categories"("id","deck_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_active_uq" ON "users" USING btree ("email") WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "decks_slug_active_uq" ON "decks" USING btree ("slug") WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_deck_slug_active_uq" ON "categories" USING btree ("deck_id","slug") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "items_list_idx" ON "items" USING btree ("deck_id","status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "item_categories_category_idx" ON "item_categories" USING btree ("category_id");