CREATE TABLE "username_holds" (
	"username_lower" text PRIMARY KEY NOT NULL,
	"released_by" uuid NOT NULL,
	"hold_until" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"changes" text[] NOT NULL,
	"request_id" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ALTER COLUMN "deck_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar" jsonb;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "scope" text DEFAULT 'deck' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "username_holds" ADD CONSTRAINT "username_holds_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_events" ADD CONSTRAINT "profile_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_events_user_idx" ON "profile_events" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_uq" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE INDEX "users_avatar_public_id_idx" ON "users" USING btree (("avatar"->>'publicId')) WHERE "users"."avatar" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "assets_owner_idx" ON "assets" USING btree ("owner_user_id") WHERE "assets"."owner_user_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_format_chk" CHECK ("users"."username" ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,29}$');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_first_name_chk" CHECK (char_length("users"."first_name") <= 60 AND "users"."first_name" = btrim("users"."first_name"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_last_name_chk" CHECK (char_length("users"."last_name") <= 60 AND "users"."last_name" = btrim("users"."last_name"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_location_chk" CHECK (char_length("users"."location") <= 100 AND "users"."location" = btrim("users"."location"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_shape_chk" CHECK ("users"."avatar" IS NULL OR (jsonb_typeof("users"."avatar") = 'object' AND jsonb_typeof("users"."avatar"->'publicId') = 'string'));--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_scope_values_chk" CHECK ("assets"."scope" IN ('deck', 'profile'));--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_scope_chk" CHECK (("assets"."scope" = 'deck') = ("assets"."deck_id" IS NOT NULL));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION users_username_hold_guard_fn() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.username IS NOT NULL AND EXISTS (
    SELECT 1 FROM username_holds h
     WHERE h.username_lower = lower(NEW.username)
       AND h.hold_until > now()
       AND h.released_by <> NEW.id
  ) THEN
    RAISE EXCEPTION 'username_held' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER users_username_hold_guard BEFORE INSERT OR UPDATE OF username ON users FOR EACH ROW EXECUTE FUNCTION users_username_hold_guard_fn();
