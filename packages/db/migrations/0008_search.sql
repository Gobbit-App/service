-- D70: the single normalization used by items.search_text and by every search query (no TS twin).
-- lower(); Greek tonos/dialytika/final sigma folded (uppercase too, in case lower() is locale-blind);
-- Hebrew points/cantillation U+0591-U+05C7 stripped (maqaf U+05BE becomes a space); combining marks
-- stripped; separators between digits removed (052-123 4567 -> 0521234567); whitespace collapsed.
CREATE OR REPLACE FUNCTION public.search_normalize(input text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          translate(lower(input), 'άέήίόύώϊϋΐΰςΆΈΉΊΌΎΏΪΫΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ', 'αεηιουωιυιυσαεηιουωιυαβγδεζηθικλμνξοπρστυφχψω'),
          '[\u0591-\u05BD\u05BF-\u05C7\u0300-\u036F]', '', 'g'),
        '\u05BE', ' ', 'g'),
      '([0-9])[[:space:].()/-]+(?=[0-9])', '\1', 'g'),
    '[[:space:]]+', ' ', 'g'))
$$;
--> statement-breakpoint
-- D69: title + body + every payload string leaf, except image publicId and calc expression.
CREATE OR REPLACE FUNCTION public.item_search_text(t item_type, title text, body text, payload jsonb) RETURNS text
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
  )))
$$;
--> statement-breakpoint
-- D74: embedded_hash = first 32 hex chars of sha256(model || search_text). Used by the job and the sweeper.
CREATE OR REPLACE FUNCTION public.item_embedding_hash(model text, search_text text) RETURNS text
LANGUAGE sql STABLE STRICT PARALLEL SAFE AS $$
  SELECT left(encode(sha256(convert_to(model || search_text, 'UTF8')), 'hex'), 32)
$$;
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"deck_id" uuid,
	"item_id" uuid,
	"user_id" uuid,
	"job_id" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	"latency_ms" integer NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_calls_purpose_chk" CHECK ("llm_calls"."purpose" IN ('embed_item', 'embed_query', 'ask')),
	CONSTRAINT "llm_calls_status_chk" CHECK ("llm_calls"."status" IN ('ok', 'error'))
);
--> statement-breakpoint
CREATE TABLE "search_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deck_id" uuid NOT NULL,
	"user_id" uuid,
	"mode" text NOT NULL,
	"q_normalized" text NOT NULL,
	"result_count" integer NOT NULL,
	"top_why" text,
	"latency_ms" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_queries_mode_chk" CHECK ("search_queries"."mode" IN ('search', 'ask')),
	CONSTRAINT "search_queries_top_why_chk" CHECK ("search_queries"."top_why" IN ('text', 'semantic', 'both'))
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "search_text" text GENERATED ALWAYS AS (item_search_text("type", "title", "body", "payload")) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "embedded_hash" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "embedded_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_queries" ADD CONSTRAINT "search_queries_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_queries" ADD CONSTRAINT "search_queries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_calls_created_idx" ON "llm_calls" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "llm_calls_item_idx" ON "llm_calls" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "search_queries_deck_created_idx" ON "search_queries" USING btree ("deck_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "items_search_trgm_idx" ON "items" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "items_embedding_hnsw_idx" ON "items" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);
--> statement-breakpoint
-- Embedding writes (worker) must not move items.updated_at: fire only for content columns.
DROP TRIGGER IF EXISTS items_set_updated_at ON items;--> statement-breakpoint
CREATE TRIGGER items_set_updated_at BEFORE UPDATE OF deck_id, type, status, title, body, payload, source_url, source_kind, verified_at, created_by, deleted_at ON items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
