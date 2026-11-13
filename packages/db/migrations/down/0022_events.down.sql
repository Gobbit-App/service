DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "items" WHERE "type"::text = 'event') THEN
    RAISE EXCEPTION 'items still has event cards; delete them before rolling back 0022_events';
  END IF;
END $$;
DROP TRIGGER IF EXISTS items_event_sync ON items;
DROP FUNCTION IF EXISTS public.items_event_sync();
ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "items_event_payload_chk";
ALTER TABLE "notification_deliveries" DROP CONSTRAINT IF EXISTS "notification_deliveries_kind_chk";
ALTER TABLE "notification_deliveries" DROP CONSTRAINT IF EXISTS "notification_deliveries_notice_id_event_notices_id_fk";
DELETE FROM "notification_deliveries" WHERE "kind"::text = 'event';
ALTER TABLE "notification_deliveries" DROP CONSTRAINT IF EXISTS "notification_deliveries_once_uq";
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_once_uq" UNIQUE("item_id","deadline","user_id","channel","target");
ALTER TABLE "notification_deliveries" DROP COLUMN IF EXISTS "notice_id";
ALTER TABLE "notification_deliveries" DROP COLUMN IF EXISTS "kind";
DROP TABLE IF EXISTS "event_mutes";
DROP TABLE IF EXISTS "event_notices";
DROP TABLE IF EXISTS "event_cards";
DROP TYPE IF EXISTS "public"."event_notice_state";
DROP TYPE IF EXISTS "public"."notification_kind";
CREATE OR REPLACE FUNCTION public.item_search_text(t item_type, title text, body text, payload jsonb, entities jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT public.search_normalize(concat_ws(' ', title, body, (
    SELECT string_agg(v #>> '{}', ' ')
    FROM jsonb_path_query(
      CASE t::text
        WHEN 'image' THEN payload - 'publicId'
        WHEN 'calc' THEN payload - 'expression'
        WHEN 'link' THEN payload #- '{preview,publicId}'
        WHEN 'reminder' THEN '{}'::jsonb
        ELSE payload
      END,
      'strict $.** ? (@.type() == "string")'
    ) AS v
  ), (
    SELECT string_agg(v #>> '{}', ' ')
    FROM jsonb_path_query(coalesce(entities, '{}'::jsonb), 'strict $.** ? (@.type() == "string")') AS v
  )))
$fn$;
DROP INDEX IF EXISTS "items_link_preview_public_id_idx";
CREATE INDEX "items_link_preview_public_id_idx" ON "items" USING btree (("payload" #>> '{preview,publicId}')) WHERE "type" = 'link';
-- The 'event' value of item_type stays: Postgres can't drop an enum value.
