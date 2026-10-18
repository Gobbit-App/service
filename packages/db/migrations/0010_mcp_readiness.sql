ALTER TYPE "public"."source_kind" ADD VALUE 'mcp';--> statement-breakpoint
ALTER TYPE "public"."ingest_channel" ADD VALUE 'mcp';--> statement-breakpoint
ALTER TABLE "ingest_jobs" ADD COLUMN "client_label" varchar(60);