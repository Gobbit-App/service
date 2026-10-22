DROP INDEX IF EXISTS "items_link_preview_public_id_idx";
-- Restore the 0009 item_search_text() body and regenerate search_text with it.
CREATE OR REPLACE FUNCTION public.item_search_text(t item_type, title text, body text, payload jsonb, entities jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT public.search_normalize(concat_ws(' ', title, body, (
    SELECT string_agg(v #>> '{}', ' ')
    FROM jsonb_path_query(
      CASE t
        WHEN 'image' THEN payload - 'publicId'
        WHEN 'calc' THEN payload - 'expression'
        ELSE payload
      END,
      'strict $.** ? (@.type() == "string")'
    ) AS v
  ), (
    SELECT string_agg(v #>> '{}', ' ')
    FROM jsonb_path_query(coalesce(entities, '{}'::jsonb), 'strict $.** ? (@.type() == "string")') AS v
  )))
$$;
DROP INDEX IF EXISTS "items_search_trgm_idx";
ALTER TABLE "items" DROP COLUMN IF EXISTS "search_text";
ALTER TABLE "items" ADD COLUMN "search_text" text GENERATED ALWAYS AS (item_search_text("type", "title", "body", "payload", "entities")) STORED NOT NULL;
CREATE INDEX "items_search_trgm_idx" ON "items" USING gin ("search_text" gin_trgm_ops);
DROP TABLE IF EXISTS "link_checks";
DROP TYPE IF EXISTS "public"."link_check_status";
