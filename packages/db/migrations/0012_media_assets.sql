CREATE TYPE "public"."asset_source" AS ENUM('editor', 'ingest', 'link_snapshot', 'remote');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deck_id" uuid NOT NULL,
	"public_id" text NOT NULL,
	"source" "asset_source" NOT NULL,
	"width" integer,
	"height" integer,
	"bytes" integer,
	"format" text,
	"uploaded_by" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_public_id_key" UNIQUE("public_id"),
	CONSTRAINT "assets_width_chk" CHECK ("assets"."width" IS NULL OR "assets"."width" > 0),
	CONSTRAINT "assets_height_chk" CHECK ("assets"."height" IS NULL OR "assets"."height" > 0),
	CONSTRAINT "assets_bytes_chk" CHECK ("assets"."bytes" IS NULL OR "assets"."bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_created_at_idx" ON "assets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "assets_deck_id_idx" ON "assets" USING btree ("deck_id");--> statement-breakpoint
-- D158: the sweep's anti-join and the D160 lookup (hand-written: expression index).
CREATE INDEX "items_image_public_id_idx" ON "items" USING btree (("payload"->>'publicId')) WHERE "type" = 'image';--> statement-breakpoint
-- D156 backfill: every image already referenced by a card is a recorded asset, so the sweep never
-- deletes it. Dimensions are unknown (null); ingest uploads are told apart by their folder;
-- created_at = now(), so the grace period starts at the migration.
INSERT INTO "assets" ("deck_id", "public_id", "source")
SELECT DISTINCT ON ("payload"->>'publicId')
  "deck_id",
  "payload"->>'publicId',
  (CASE WHEN "payload"->>'publicId' LIKE 'gobbit/ingest/%' THEN 'ingest' ELSE 'editor' END)::"asset_source"
FROM "items"
WHERE "type" = 'image' AND coalesce("payload"->>'publicId', '') <> ''
ORDER BY "payload"->>'publicId', "created_at"
ON CONFLICT ("public_id") DO NOTHING;
