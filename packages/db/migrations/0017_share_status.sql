ALTER TABLE "decks" ADD COLUMN "auto_publish_shares" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ingest_jobs" ADD COLUMN "failure_code" text;--> statement-breakpoint
ALTER TABLE "ingest_jobs" ADD COLUMN "auto_publish" text;--> statement-breakpoint
ALTER TABLE "ingest_jobs" ADD COLUMN "retry_count" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ingest_jobs" ADD COLUMN "retried_at" timestamp (3) with time zone;--> statement-breakpoint
CREATE INDEX "ingest_jobs_sharer_deck_idx" ON "ingest_jobs" USING btree ("user_id","deck_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "ingest_jobs" ADD CONSTRAINT "ingest_jobs_failure_code_chk" CHECK ("ingest_jobs"."failure_code" IS NULL OR "ingest_jobs"."failure_code" IN ('content_expired', 'sharer_left', 'fetch_failed', 'unreadable_answer', 'assistant_unavailable', 'image_unavailable', 'unknown'));--> statement-breakpoint
ALTER TABLE "ingest_jobs" ADD CONSTRAINT "ingest_jobs_failure_code_status_chk" CHECK ("ingest_jobs"."failure_code" IS NULL OR "ingest_jobs"."status" = 'failed');--> statement-breakpoint
ALTER TABLE "ingest_jobs" ADD CONSTRAINT "ingest_jobs_auto_publish_chk" CHECK ("ingest_jobs"."auto_publish" IS NULL OR "ingest_jobs"."auto_publish" IN ('published', 'held_not_publisher', 'held_needs_category', 'held_duplicate', 'held_duplicate_check_failed', 'held_publish_failed'));--> statement-breakpoint
ALTER TABLE "ingest_jobs" ADD CONSTRAINT "ingest_jobs_retry_count_chk" CHECK ("ingest_jobs"."retry_count" BETWEEN 0 AND 3);--> statement-breakpoint
-- D192: personal decks publish their owner's shares directly.
UPDATE "decks" SET "auto_publish_shares" = true WHERE "is_default";--> statement-breakpoint
-- D194: reasons for jobs that failed before failure codes existed.
UPDATE "ingest_jobs" SET "failure_code" = CASE
  WHEN "error" = 'raw_missing' THEN 'content_expired'
  WHEN "error" IN ('sharer_gone', 'sharer_not_member') THEN 'sharer_left'
  WHEN "error" LIKE 'invalid_output%' THEN 'unreadable_answer'
  ELSE 'unknown'
END
WHERE "status" = 'failed';