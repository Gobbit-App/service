CREATE TYPE "public"."notification_kind" AS ENUM('reminder', 'event');--> statement-breakpoint
CREATE TYPE "public"."event_notice_state" AS ENUM('pending', 'planned', 'skipped');--> statement-breakpoint
ALTER TYPE "public"."item_type" ADD VALUE 'event';--> statement-breakpoint
CREATE TABLE "event_cards" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"deck_id" uuid NOT NULL,
	"all_day" boolean NOT NULL,
	"starts_at" timestamp (3) with time zone NOT NULL,
	"ends_at" timestamp (3) with time zone NOT NULL,
	"time_zone" text NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_cards_span_chk" CHECK ("event_cards"."ends_at" > "event_cards"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "event_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"starts_at" timestamp (3) with time zone NOT NULL,
	"before_amount" integer NOT NULL,
	"before_unit" text NOT NULL,
	"fire_at" timestamp (3) with time zone NOT NULL,
	"state" "event_notice_state" DEFAULT 'pending' NOT NULL,
	"skip_reason" text,
	"planned_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_notices_once_uq" UNIQUE("item_id","starts_at","before_amount","before_unit"),
	CONSTRAINT "event_notices_amount_chk" CHECK ("event_notices"."before_amount" >= 0),
	CONSTRAINT "event_notices_unit_chk" CHECK ("event_notices"."before_unit" IN ('minutes', 'hours', 'days')),
	CONSTRAINT "event_notices_skip_reason_chk" CHECK ("event_notices"."skip_reason" IS NULL OR "event_notices"."skip_reason" IN ('past_at_save', 'past_at_publish', 'past_at_restore', 'started')),
	CONSTRAINT "event_notices_skipped_chk" CHECK (("event_notices"."state" = 'skipped') = ("event_notices"."skip_reason" IS NOT NULL)),
	CONSTRAINT "event_notices_planned_chk" CHECK (("event_notices"."state" = 'planned') = ("event_notices"."planned_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "event_mutes" (
	"item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"muted" boolean NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_mutes_pk" PRIMARY KEY("item_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" DROP CONSTRAINT "notification_deliveries_once_uq";--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "kind" "notification_kind" DEFAULT 'reminder' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "notice_id" uuid;--> statement-breakpoint
ALTER TABLE "event_cards" ADD CONSTRAINT "event_cards_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_cards" ADD CONSTRAINT "event_cards_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_notices" ADD CONSTRAINT "event_notices_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_mutes" ADD CONSTRAINT "event_mutes_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_mutes" ADD CONSTRAINT "event_mutes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_cards_ends_idx" ON "event_cards" USING btree ("ends_at");--> statement-breakpoint
CREATE INDEX "event_cards_deck_idx" ON "event_cards" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "event_notices_due_idx" ON "event_notices" USING btree ("fire_at") WHERE "event_notices"."state" = 'pending';--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notice_id_event_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."event_notices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_once_uq" UNIQUE NULLS NOT DISTINCT("item_id","kind","notice_id","deadline","user_id","channel","target");--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_event_payload_chk" CHECK ("items"."type"::text <> 'event' OR coalesce(jsonb_typeof("items"."payload"->'allDay') = 'boolean' AND jsonb_typeof("items"."payload"->'start') = 'string' AND jsonb_typeof("items"."payload"->'timeZone') = 'string' AND (NOT "items"."payload" ? 'location' OR char_length("items"."payload"->>'location') <= 200) AND jsonb_typeof("items"."payload"#>'{notify,before}') = 'array' AND jsonb_array_length("items"."payload"#>'{notify,before}') <= 3, false));--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_kind_chk" CHECK (("notification_deliveries"."kind" = 'event') = ("notification_deliveries"."notice_id" IS NOT NULL));--> statement-breakpoint
-- D358: one event_cards row per event item, mirroring eventSpan() in @gobbit/shared/events-cards.
-- Timed: start .. end (or start + 1 h). All-day: start 00:00 .. (end or start) + 1 day 00:00 in the zone.
-- Compares type as text: 'event' is new in this (single-transaction) migration run.
CREATE OR REPLACE FUNCTION public.items_event_sync() RETURNS TRIGGER AS $$
DECLARE
  tz text;
  s timestamptz;
  e timestamptz;
BEGIN
  IF NEW.type::text = 'event' THEN
    tz := NEW.payload ->> 'timeZone';
    IF (NEW.payload ->> 'allDay')::boolean THEN
      s := ((NEW.payload ->> 'start')::date)::timestamp AT TIME ZONE tz;
      e := ((coalesce(NEW.payload ->> 'end', NEW.payload ->> 'start')::date + 1))::timestamp AT TIME ZONE tz;
    ELSE
      s := (NEW.payload ->> 'start')::timestamptz;
      e := coalesce((NEW.payload ->> 'end')::timestamptz, s + interval '1 hour');
    END IF;
    INSERT INTO event_cards (item_id, deck_id, all_day, starts_at, ends_at, time_zone)
    VALUES (NEW.id, NEW.deck_id, (NEW.payload ->> 'allDay')::boolean, s, e, tz)
    ON CONFLICT (item_id) DO UPDATE
      SET deck_id = EXCLUDED.deck_id, all_day = EXCLUDED.all_day, starts_at = EXCLUDED.starts_at,
          ends_at = EXCLUDED.ends_at, time_zone = EXCLUDED.time_zone
      WHERE (event_cards.deck_id, event_cards.all_day, event_cards.starts_at, event_cards.ends_at, event_cards.time_zone)
        IS DISTINCT FROM (EXCLUDED.deck_id, EXCLUDED.all_day, EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.time_zone);
  ELSIF TG_OP = 'UPDATE' THEN
    DELETE FROM event_cards WHERE item_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER items_event_sync AFTER INSERT OR UPDATE OF type, payload, deck_id ON items FOR EACH ROW EXECUTE FUNCTION items_event_sync();--> statement-breakpoint
CREATE TRIGGER event_cards_set_updated_at BEFORE UPDATE ON event_cards FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER event_notices_set_updated_at BEFORE UPDATE ON event_notices FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER event_mutes_set_updated_at BEFORE UPDATE ON event_mutes FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- D365: an event is searchable by its title, body, location and link preview text only (not its
-- time, zone or notify settings). No event rows exist yet, so search_text values don't change.
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
--> statement-breakpoint
-- D372: events carry the link card's preview snapshot too. The predicate no longer names the type
-- (an enum value added in this transaction can't be used, and ::text isn't immutable); only link
-- and event payloads have preview.publicId, and an equality lookup on it implies IS NOT NULL.
DROP INDEX IF EXISTS "items_link_preview_public_id_idx";--> statement-breakpoint
CREATE INDEX "items_link_preview_public_id_idx" ON "items" USING btree (("payload" #>> '{preview,publicId}')) WHERE ("payload" #>> '{preview,publicId}') IS NOT NULL;
