CREATE TYPE "public"."reminder_outcome" AS ENUM('pending', 'done', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'push');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sending', 'sent', 'failed', 'interrupted', 'gone');--> statement-breakpoint
ALTER TYPE "public"."item_type" ADD VALUE 'reminder';--> statement-breakpoint
ALTER TYPE "public"."item_event_kind" ADD VALUE 'completed';--> statement-breakpoint
ALTER TYPE "public"."item_event_kind" ADD VALUE 'dismissed';--> statement-breakpoint
CREATE TABLE "reminders" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"deck_id" uuid NOT NULL,
	"deadline" timestamp (3) with time zone NOT NULL,
	"outcome" "reminder_outcome" DEFAULT 'pending' NOT NULL,
	"dismissed_by" uuid,
	"dismissed_at" timestamp (3) with time zone,
	"resolution" text,
	"notified_deadline" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_dismissed_chk" CHECK (("reminders"."outcome" = 'pending') = ("reminders"."dismissed_at" IS NULL)),
	CONSTRAINT "reminders_resolution_chk" CHECK ("reminders"."resolution" IS NULL OR char_length("reminders"."resolution") <= 600)
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"label" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp (3) with time zone,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"deadline" timestamp (3) with time zone NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"target" text NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_once_uq" UNIQUE("item_id","deadline","user_id","channel","target"),
	CONSTRAINT "notification_deliveries_attempts_chk" CHECK ("notification_deliveries"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reminder_emails" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "reveal_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_dismissed_by_users_id_fk" FOREIGN KEY ("dismissed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminders_due_idx" ON "reminders" USING btree ("deadline") WHERE "reminders"."outcome" = 'pending';--> statement-breakpoint
CREATE INDEX "reminders_deck_idx" ON "reminders" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_due_idx" ON "notification_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "items_reveal_idx" ON "items" USING btree ("deck_id","reveal_at") WHERE "items"."reveal_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_reveal_at_chk" CHECK (("items"."type"::text = 'reminder') = ("items"."reveal_at" IS NOT NULL));;--> statement-breakpoint
-- D291: reveal_at follows the payload (instant arithmetic: a "day" is 24 h, as in @gobbit/shared/reminders).
-- Compares type as text: 'reminder' is new in this (single-transaction) migration run.
CREATE OR REPLACE FUNCTION public.items_reminder_reveal() RETURNS TRIGGER AS $$
DECLARE
  unit_seconds numeric;
BEGIN
  IF NEW.type::text = 'reminder' THEN
    unit_seconds := CASE NEW.payload #>> '{showBefore,unit}'
      WHEN 'minutes' THEN 60
      WHEN 'hours' THEN 3600
      WHEN 'days' THEN 86400
    END;
    IF unit_seconds IS NULL OR (NEW.payload ->> 'deadline') IS NULL THEN
      RAISE EXCEPTION 'reminder_payload_invalid' USING ERRCODE = 'P0001';
    END IF;
    NEW.reveal_at := (NEW.payload ->> 'deadline')::timestamptz
      - ((NEW.payload #>> '{showBefore,amount}')::numeric * unit_seconds) * interval '1 second';
  ELSE
    NEW.reveal_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER items_reminder_reveal BEFORE INSERT OR UPDATE OF type, payload ON items FOR EACH ROW EXECUTE FUNCTION items_reminder_reveal();--> statement-breakpoint
-- D291: one reminders row per reminder item; deck and deadline copied from the item.
CREATE OR REPLACE FUNCTION public.items_reminder_sync() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type::text = 'reminder' THEN
    INSERT INTO reminders (item_id, deck_id, deadline)
    VALUES (NEW.id, NEW.deck_id, (NEW.payload ->> 'deadline')::timestamptz)
    ON CONFLICT (item_id) DO UPDATE
      SET deck_id = EXCLUDED.deck_id, deadline = EXCLUDED.deadline
      WHERE reminders.deck_id IS DISTINCT FROM EXCLUDED.deck_id
         OR reminders.deadline IS DISTINCT FROM EXCLUDED.deadline;
  ELSIF TG_OP = 'UPDATE' THEN
    DELETE FROM reminders WHERE item_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER items_reminder_sync AFTER INSERT OR UPDATE OF type, payload, deck_id ON items FOR EACH ROW EXECUTE FUNCTION items_reminder_sync();--> statement-breakpoint
CREATE TRIGGER reminders_set_updated_at BEFORE UPDATE ON reminders FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER notification_deliveries_set_updated_at BEFORE UPDATE ON notification_deliveries FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- D291: a reminder's settings (deadline, unit, dismiss rule, people, zone) are not searchable text.
-- No reminder rows exist yet, so search_text values don't change and the column needn't be re-added.
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
        ELSE payload
      END,
      'strict $.** ? (@.type() == "string")'
    ) AS v
  ), (
    SELECT string_agg(v #>> '{}', ' ')
    FROM jsonb_path_query(coalesce(entities, '{}'::jsonb), 'strict $.** ? (@.type() == "string")') AS v
  )))
$$;
