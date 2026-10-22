CREATE TYPE "public"."link_check_status" AS ENUM('ok', 'dead', 'changed', 'unchecked');--> statement-breakpoint
CREATE TABLE "link_checks" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"status" "link_check_status" NOT NULL,
	"http_status" integer,
	"error" text,
	"title_seen" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"checked_at" timestamp (3) with time zone NOT NULL,
	"next_check_at" timestamp (3) with time zone NOT NULL,
	"flagged_at" timestamp (3) with time zone,
	"dismissed_at" timestamp (3) with time zone,
	CONSTRAINT "link_checks_failures_chk" CHECK ("link_checks"."consecutive_failures" >= 0),
	CONSTRAINT "link_checks_dismissed_chk" CHECK ("link_checks"."dismissed_at" IS NULL OR "link_checks"."flagged_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "link_checks" ADD CONSTRAINT "link_checks_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "link_checks_next_check_idx" ON "link_checks" USING btree ("next_check_at");--> statement-breakpoint
CREATE INDEX "link_checks_flagged_idx" ON "link_checks" USING btree ("flagged_at" DESC NULLS LAST) WHERE "link_checks"."flagged_at" IS NOT NULL AND "link_checks"."dismissed_at" IS NULL;--> statement-breakpoint
-- D163: a link's stored snapshot id (preview.publicId) is not searchable, like an image card's publicId.
CREATE OR REPLACE FUNCTION public.item_search_text(t item_type, title text, body text, payload jsonb, entities jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
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
$$;
--> statement-breakpoint
-- The generated column keeps the old expression until re-added (as in 0009). No row has
-- preview.publicId yet, so search_text values, hashes and embeddings don't change.
ALTER TABLE "items" DROP COLUMN "search_text";--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "search_text" text GENERATED ALWAYS AS (item_search_text("type", "title", "body", "payload", "entities")) STORED NOT NULL;--> statement-breakpoint
CREATE INDEX "items_search_trgm_idx" ON "items" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
-- D158/D160 for link snapshots: the orphan sweep's reference and the asset lookup (hand-written: expression index).
CREATE INDEX "items_link_preview_public_id_idx" ON "items" USING btree (("payload" #>> '{preview,publicId}')) WHERE "type" = 'link';
