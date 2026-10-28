CREATE TYPE "public"."waitlist_event_action" AS ENUM('created', 'resent', 'confirmed', 'invited', 'invite_resent', 'removed');--> statement-breakpoint
CREATE TYPE "public"."waitlist_kind" AS ENUM('family', 'community', 'personal', 'other');--> statement-breakpoint
CREATE TYPE "public"."waitlist_source" AS ENUM('landing', 'sign_in');--> statement-breakpoint
CREATE TYPE "public"."waitlist_status" AS ENUM('pending', 'confirmed', 'invited', 'removed');--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"kind" "waitlist_kind" NOT NULL,
	"note" text,
	"source" "waitlist_source" NOT NULL,
	"utm_source" text,
	"status" "waitlist_status" DEFAULT 'pending' NOT NULL,
	"confirm_token_hash" text,
	"confirm_expires_at" timestamp (3) with time zone,
	"confirmed_at" timestamp (3) with time zone,
	"invited_at" timestamp (3) with time zone,
	"invited_by" uuid,
	"user_id" uuid,
	"removed_at" timestamp (3) with time zone,
	"removed_by" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_email_normalized" CHECK ("waitlist_entries"."email" = lower(btrim("waitlist_entries"."email")) AND "waitlist_entries"."email" <> ''),
	CONSTRAINT "waitlist_note_len" CHECK ("waitlist_entries"."note" IS NULL OR char_length("waitlist_entries"."note") <= 500),
	CONSTRAINT "waitlist_utm_source_fmt" CHECK ("waitlist_entries"."utm_source" IS NULL OR "waitlist_entries"."utm_source" ~ '^[a-z0-9_-]{1,64}$'),
	CONSTRAINT "waitlist_pending_has_token" CHECK ("waitlist_entries"."status" <> 'pending' OR ("waitlist_entries"."confirm_token_hash" IS NOT NULL AND "waitlist_entries"."confirm_expires_at" IS NOT NULL)),
	CONSTRAINT "waitlist_confirmed_has_time" CHECK ("waitlist_entries"."status" NOT IN ('confirmed', 'invited') OR "waitlist_entries"."confirmed_at" IS NOT NULL),
	CONSTRAINT "waitlist_invited_has_time" CHECK ("waitlist_entries"."status" <> 'invited' OR "waitlist_entries"."invited_at" IS NOT NULL),
	CONSTRAINT "waitlist_removed_has_time" CHECK ("waitlist_entries"."status" <> 'removed' OR "waitlist_entries"."removed_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "waitlist_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"action" "waitlist_event_action" NOT NULL,
	"actor_id" uuid,
	"source" "waitlist_source",
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_events" ADD CONSTRAINT "waitlist_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_entries_email_live_uq" ON "waitlist_entries" USING btree ("email") WHERE "waitlist_entries"."status" <> 'removed';--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_entries_confirm_token_uq" ON "waitlist_entries" USING btree ("confirm_token_hash") WHERE "waitlist_entries"."confirm_token_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "waitlist_entries_status_created_idx" ON "waitlist_entries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "waitlist_entries_status_confirmed_idx" ON "waitlist_entries" USING btree ("status","confirmed_at","id");--> statement-breakpoint
CREATE INDEX "waitlist_events_entry_idx" ON "waitlist_events" USING btree ("entry_id","created_at");--> statement-breakpoint
CREATE INDEX "waitlist_events_created_idx" ON "waitlist_events" USING btree ("created_at");--> statement-breakpoint
CREATE TRIGGER waitlist_entries_set_updated_at BEFORE UPDATE ON waitlist_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- D221: demand by ISO week (Monday, database time zone), kind, source and effective status;
-- `joined` = invited and the user has signed in at least once (has a sessions row).
CREATE VIEW waitlist_summary AS
SELECT
  date_trunc('week', e.created_at)::date AS week,
  e.kind,
  e.source,
  CASE
    WHEN e.status = 'invited' AND EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = e.user_id)
      THEN 'joined'
    ELSE e.status::text
  END AS status,
  count(*)::int AS entries
FROM waitlist_entries e
GROUP BY 1, 2, 3, 4;
