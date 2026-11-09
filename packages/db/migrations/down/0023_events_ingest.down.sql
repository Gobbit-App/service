UPDATE "ingest_jobs" SET "auto_publish" = NULL WHERE "auto_publish" = 'held_event_unverified';
ALTER TABLE "ingest_jobs" DROP CONSTRAINT IF EXISTS "ingest_jobs_auto_publish_chk";
ALTER TABLE "ingest_jobs" ADD CONSTRAINT "ingest_jobs_auto_publish_chk" CHECK ("ingest_jobs"."auto_publish" IS NULL OR "ingest_jobs"."auto_publish" IN ('published', 'held_not_publisher', 'held_needs_category', 'held_duplicate', 'held_duplicate_check_failed', 'held_publish_failed'));
