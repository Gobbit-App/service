CREATE TYPE "public"."actor_via" AS ENUM('session', 'ingest');--> statement-breakpoint
CREATE TYPE "public"."item_event_kind" AS ENUM('created', 'proposed', 'published', 'updated', 'archived', 'restored', 'deleted', 'undeleted', 'discarded', 'merged');--> statement-breakpoint
CREATE TABLE "item_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deck_id" uuid NOT NULL,
	"item_id" uuid,
	"actor_user_id" uuid,
	"via" "actor_via" NOT NULL,
	"kind" "item_event_kind" NOT NULL,
	"title" varchar(200) NOT NULL,
	"changes" text[],
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_events_changes_chk" CHECK ("item_events"."changes" IS NULL OR "item_events"."kind" IN ('updated', 'merged'))
);
--> statement-breakpoint
ALTER TABLE "item_events" ADD CONSTRAINT "item_events_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_events" ADD CONSTRAINT "item_events_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_events" ADD CONSTRAINT "item_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_events_deck_created_idx" ON "item_events" USING btree ("deck_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "item_events_item_created_idx" ON "item_events" USING btree ("item_id","created_at" DESC NULLS LAST);