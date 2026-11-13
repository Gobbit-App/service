-- Back to image cards (pre-045). Refused while anything exists that the old code can't render or
-- delete: a PDF, audio or video card, a gallery of more than one photo, or a video/PDF asset.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM items WHERE type = 'media' AND payload->>'kind' <> 'image') THEN
    RAISE EXCEPTION '0025_media_cards down: PDF, audio or video cards exist; delete them first';
  END IF;
  IF EXISTS (SELECT 1 FROM items WHERE type = 'media' AND jsonb_array_length(payload->'images') > 1) THEN
    RAISE EXCEPTION '0025_media_cards down: gallery cards with several photos exist';
  END IF;
  IF EXISTS (SELECT 1 FROM assets WHERE resource_type = 'video' OR kind = 'pdf') THEN
    RAISE EXCEPTION '0025_media_cards down: PDF, audio or video files are recorded';
  END IF;
END
$$;

DROP INDEX IF EXISTS "items_media_payload_idx";
ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "items_media_files_check";
ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "items_media_kind_check";

ALTER TYPE "public"."item_type" RENAME VALUE 'media' TO 'image';

-- The 0022 function, restored before the flatten so search_text is recomputed with it.
CREATE OR REPLACE FUNCTION public.item_search_text(t item_type, title text, body text, payload jsonb, entities jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT public.search_normalize(concat_ws(' ', title, body, (
    SELECT string_agg(v #>> '{}', ' ')
    FROM jsonb_path_query(
      CASE t::text
        WHEN 'image' THEN payload - 'publicId'
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

ALTER TABLE "items" DISABLE TRIGGER "items_set_updated_at";
UPDATE "items" SET "payload" = "payload" #> '{images,0}'
WHERE "type" = 'image' AND "payload" ? 'images';
ALTER TABLE "items" ENABLE TRIGGER "items_set_updated_at";

CREATE INDEX "items_image_public_id_idx" ON "items" USING btree (("payload"->>'publicId')) WHERE "type" = 'image';

ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_kind_resource_check";
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_original_filename_chk";
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_pages_chk";
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_duration_chk";
DROP INDEX IF EXISTS "assets_deck_etag_idx";
ALTER TABLE "assets" DROP COLUMN "rejected_at";
ALTER TABLE "assets" DROP COLUMN "verified_at";
ALTER TABLE "assets" DROP COLUMN "original_filename";
ALTER TABLE "assets" DROP COLUMN "etag";
ALTER TABLE "assets" DROP COLUMN "pages";
ALTER TABLE "assets" DROP COLUMN "duration_ms";
ALTER TABLE "assets" DROP COLUMN "kind";
ALTER TABLE "assets" DROP COLUMN "resource_type";
DROP TYPE "public"."media_kind";
DROP TYPE "public"."asset_resource_type";
