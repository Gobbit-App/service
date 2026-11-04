DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "items" WHERE "type"::text = 'reminder') THEN
    RAISE EXCEPTION 'items still has reminder cards; delete them before rolling back 0021_reminders';
  END IF;
  IF EXISTS (SELECT 1 FROM "item_events" WHERE "kind"::text IN ('completed', 'dismissed')) THEN
    RAISE EXCEPTION 'item_events has reminder events; delete them before rolling back 0021_reminders';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.item_search_text(t item_type, title text, body text, payload jsonb, entities jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT public.search_normalize(concat_ws(' ', title, body, (
    SELECT string_agg(v #>> '{}', ' ')
    FROM jsonb_path_query(
      CASE t
        WHEN 'image' THEN payload - 'publicId'
        WHEN 'calc' THEN payload - 'expression'
        WHEN 'link' THEN payload #- '{preview,publicId}'
        ELSE payload
      END,
      'strict $.** ? (@.type() == "string")'
    ) AS v
  ), (
    SELECT string_agg(v #>> '{}', ' ')
    FROM jsonb_path_query(coalesce(entities, '{}'::jsonb), 'strict $.** ? (@.type() == "string")') AS v
  )))
$fn$;
DROP TRIGGER IF EXISTS items_reminder_sync ON items;
DROP TRIGGER IF EXISTS items_reminder_reveal ON items;
DROP FUNCTION IF EXISTS public.items_reminder_sync();
DROP FUNCTION IF EXISTS public.items_reminder_reveal();
ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "items_reveal_at_chk";
DROP INDEX IF EXISTS "items_reveal_idx";
ALTER TABLE "items" DROP COLUMN IF EXISTS "reveal_at";
ALTER TABLE "users" DROP COLUMN IF EXISTS "reminder_emails";
DROP TABLE IF EXISTS "notification_deliveries";
DROP TABLE IF EXISTS "push_subscriptions";
DROP TABLE IF EXISTS "reminders";
DROP TYPE IF EXISTS "public"."notification_status";
DROP TYPE IF EXISTS "public"."notification_channel";
DROP TYPE IF EXISTS "public"."reminder_outcome";
-- Enum values can't be dropped: item_event_kind is recreated without them. item_type keeps the
-- unused 'reminder' value (item_search_text and the generated search_text depend on the type).
ALTER TYPE "public"."item_event_kind" RENAME TO "item_event_kind_old";
CREATE TYPE "public"."item_event_kind" AS ENUM('created', 'proposed', 'published', 'updated', 'archived', 'restored', 'deleted', 'undeleted', 'discarded', 'merged');
ALTER TABLE "item_events" DROP CONSTRAINT "item_events_changes_chk";
ALTER TABLE "item_events" ALTER COLUMN "kind" TYPE "public"."item_event_kind" USING "kind"::text::"public"."item_event_kind";
DROP TYPE "public"."item_event_kind_old";
ALTER TABLE "item_events" ADD CONSTRAINT "item_events_changes_chk" CHECK ("item_events"."changes" IS NULL OR "item_events"."kind" IN ('updated', 'merged'));
