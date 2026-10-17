CREATE TYPE "public"."ingest_channel" AS ENUM('pwa', 'shortcut', 'email', 'paste');--> statement-breakpoint
CREATE TYPE "public"."ingest_job_status" AS ENUM('queued', 'running', 'proposed', 'failed', 'published', 'discarded');--> statement-breakpoint
CREATE TABLE "ingest_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"deck_id" uuid NOT NULL,
	"channel" "ingest_channel" NOT NULL,
	"status" "ingest_job_status" DEFAULT 'queued' NOT NULL,
	"raw" jsonb,
	"normalized" jsonb,
	"extraction" jsonb,
	"dedup" jsonb,
	"result_item_id" uuid,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp (3) with time zone,
	"finished_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"deck_id" uuid,
	"label" varchar(60) NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" varchar(12) NOT NULL,
	"last_used_at" timestamp (3) with time zone,
	"revoked_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingest_tokens_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "ingest_jobs" ADD CONSTRAINT "ingest_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_jobs" ADD CONSTRAINT "ingest_jobs_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_jobs" ADD CONSTRAINT "ingest_jobs_result_item_id_items_id_fk" FOREIGN KEY ("result_item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_jobs" ADD CONSTRAINT "ingest_jobs_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_tokens" ADD CONSTRAINT "ingest_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_tokens" ADD CONSTRAINT "ingest_tokens_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingest_jobs_user_idx" ON "ingest_jobs" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ingest_jobs_deck_status_idx" ON "ingest_jobs" USING btree ("deck_id","status");--> statement-breakpoint
CREATE INDEX "ingest_jobs_result_item_idx" ON "ingest_jobs" USING btree ("result_item_id");--> statement-breakpoint
CREATE INDEX "ingest_tokens_user_idx" ON "ingest_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE TRIGGER ingest_jobs_set_updated_at BEFORE UPDATE ON ingest_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- D110: extraction and draft embeddings are logged like the P4 calls.
ALTER TABLE "llm_calls" DROP CONSTRAINT "llm_calls_purpose_chk";--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_purpose_chk" CHECK ("llm_calls"."purpose" IN ('embed_item', 'embed_query', 'ask', 'extract', 'extract_escalated', 'embed_draft'));--> statement-breakpoint
-- D97: entities are a cross-type column, searchable through search_text.
ALTER TABLE "items" ADD COLUMN "entities" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_entities_chk" CHECK (jsonb_typeof("items"."entities") = 'object' AND octet_length("items"."entities"::text) <= 2048);--> statement-breakpoint
-- D97: the 4-argument item_search_text() stays (tests and the down file use it); search_text uses this one.
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
--> statement-breakpoint
-- Dropping the generated column drops items_search_trgm_idx with it; both come back below.
-- Empty entities add nothing (concat_ws skips NULL), so existing items keep their search_text and hash.
ALTER TABLE "items" DROP COLUMN "search_text";--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "search_text" text GENERATED ALWAYS AS (item_search_text("type", "title", "body", "payload", "entities")) STORED NOT NULL;--> statement-breakpoint
CREATE INDEX "items_search_trgm_idx" ON "items" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
-- Entities are content: editing them moves updated_at (embedding writes still don't).
DROP TRIGGER IF EXISTS items_set_updated_at ON items;--> statement-breakpoint
CREATE TRIGGER items_set_updated_at BEFORE UPDATE OF deck_id, type, status, title, body, payload, entities, source_url, source_kind, verified_at, created_by, deleted_at ON items FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- D95: a live published item has at least one category. Deferred to commit, so a transaction
-- may publish and then set categories (or swap them) in any order.
CREATE OR REPLACE FUNCTION public.check_published_item_category() RETURNS TRIGGER AS $$
DECLARE
  target uuid;
BEGIN
  IF TG_TABLE_NAME = 'items' THEN
    target := NEW.id;
  ELSE
    target := OLD.item_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM items i
    WHERE i.id = target
      AND i.status = 'published'
      AND i.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM item_categories ic WHERE ic.item_id = i.id)
  ) THEN
    RAISE EXCEPTION 'item_needs_category' USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER items_published_has_category
  AFTER INSERT OR UPDATE OF status, deleted_at ON items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_published_item_category();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER item_categories_published_has_category
  AFTER DELETE ON item_categories
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_published_item_category();
