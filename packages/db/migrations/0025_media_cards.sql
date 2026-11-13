-- 045 media cards (D386, D388, D396, D398). Hand-edited: drizzle-kit can't express RENAME VALUE,
-- the payload reshape or the GIN index; the snapshot matches packages/db/src/schema.
-- D386: catalogue-only rename, no table rewrite; existing rows read `media` from here on.
ALTER TYPE "public"."item_type" RENAME VALUE 'image' TO 'media';--> statement-breakpoint
CREATE TYPE "public"."asset_resource_type" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('image', 'pdf', 'audio', 'video');--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "resource_type" "asset_resource_type" DEFAULT 'image' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "kind" "media_kind" DEFAULT 'image' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "pages" integer;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "etag" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "original_filename" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "verified_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "rejected_at" timestamp (3) with time zone;--> statement-breakpoint
CREATE INDEX "assets_deck_etag_idx" ON "assets" USING btree ("deck_id","etag") WHERE "assets"."etag" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_duration_chk" CHECK ("assets"."duration_ms" IS NULL OR "assets"."duration_ms" > 0);--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_pages_chk" CHECK ("assets"."pages" IS NULL OR "assets"."pages" > 0);--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_original_filename_chk" CHECK ("assets"."original_filename" IS NULL OR char_length("assets"."original_filename") <= 200);--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_kind_resource_check" CHECK (("assets"."kind" IN ('image', 'pdf') AND "assets"."resource_type" = 'image') OR ("assets"."kind" IN ('audio', 'video') AND "assets"."resource_type" = 'video'));--> statement-breakpoint
-- D398/FR-029: a media card is found by every photo's description, a file's description and its
-- file name; no longer by the width/height digits `payload - 'publicId'` used to index. Copy of
-- the 0022 function with only the media arm changed. Replaced before the reshape below, which
-- recomputes the generated search_text of every media row.
CREATE OR REPLACE FUNCTION public.item_search_text(t item_type, title text, body text, payload jsonb, entities jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT public.search_normalize(concat_ws(' ', title, body, (
    SELECT string_agg(v #>> '{}', ' ')
    FROM jsonb_path_query(
      CASE t::text
        WHEN 'media' THEN jsonb_strip_nulls(jsonb_build_object(
          'alts', jsonb_path_query_array(payload, '$.images[*].alt'),
          'alt', payload -> 'alt',
          'fileName', payload -> 'fileName'))
        WHEN 'calc' THEN payload - 'expression'
        WHEN 'link' THEN payload #- '{preview,publicId}'
        WHEN 'reminder' THEN '{}'::jsonb
        WHEN 'event' THEN jsonb_strip_nulls(jsonb_build_object(
          'location', payload -> 'location',
          'url', payload -> 'url',
          'title', payload #> '{preview,title}',
          'description', payload #> '{preview,description}'))
        ELSE payload
      END,
      'strict $.** ? (@.type() == "string")'
    ) AS v
  ), (
    SELECT string_agg(v #>> '{}', ' ')
    FROM jsonb_path_query(coalesce(entities, '{}'::jsonb), 'strict $.** ? (@.type() == "string")') AS v
  )))
$$;
--> statement-breakpoint
DROP INDEX IF EXISTS "items_image_public_id_idx";--> statement-breakpoint
-- D386/D398: every existing photo card becomes a one-photo gallery. updated_at must not move (list
-- order, share content hash, "recently changed"), so the trigger is off for the backfill only.
ALTER TABLE "items" DISABLE TRIGGER "items_set_updated_at";--> statement-breakpoint
UPDATE "items"
SET "payload" = jsonb_build_object('kind', 'image', 'images', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
  'publicId', "payload" -> 'publicId',
  'alt', "payload" -> 'alt',
  'width', "payload" -> 'width',
  'height', "payload" -> 'height'))))
WHERE "type" = 'media' AND NOT "payload" ? 'kind';--> statement-breakpoint
ALTER TABLE "items" ENABLE TRIGGER "items_set_updated_at";--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_media_kind_check" CHECK ("items"."type"::text <> 'media' OR coalesce("items"."payload"->>'kind' IN ('image', 'pdf', 'audio', 'video'), false));--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_media_files_check" CHECK ("items"."type"::text <> 'media' OR coalesce(CASE "items"."payload"->>'kind' WHEN 'image' THEN jsonb_typeof("items"."payload"->'images') = 'array' AND jsonb_array_length("items"."payload"->'images') BETWEEN 1 AND 8 AND NOT jsonb_path_exists("items"."payload", '$.images[*] ? (!(exists(@.publicId)) || @.publicId == "")') ELSE coalesce("items"."payload"->>'publicId', '') <> '' END, false));--> statement-breakpoint
-- D398: "which media card holds this file" (sweep, dedup, share preview) asks
-- payload @> '{"images":[{"publicId":…}]}' or payload @> '{"publicId":…}'. A renamed value (unlike
-- an added one) is safe to use in the same transaction, and ::text isn't immutable.
CREATE INDEX "items_media_payload_idx" ON "items" USING gin ("payload" jsonb_path_ops) WHERE "type" = 'media';
