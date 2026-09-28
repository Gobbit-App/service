CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "health" (
	"id" smallint PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
INSERT INTO "health" ("id", "status") VALUES (1, 'ok') ON CONFLICT ("id") DO NOTHING;
