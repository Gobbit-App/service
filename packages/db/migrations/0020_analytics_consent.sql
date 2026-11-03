CREATE TYPE "public"."analytics_consent" AS ENUM('allowed', 'declined');--> statement-breakpoint
CREATE TYPE "public"."analytics_consent_source" AS ENUM('prompt', 'settings');--> statement-breakpoint
CREATE TABLE "analytics_consent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"from_value" "analytics_consent",
	"to_value" "analytics_consent" NOT NULL,
	"source" "analytics_consent_source" NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_consent_events_changed" CHECK ("analytics_consent_events"."from_value" IS DISTINCT FROM "analytics_consent_events"."to_value")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "analytics_consent" "analytics_consent";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "analytics_consent_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "analytics_consent_source" "analytics_consent_source";--> statement-breakpoint
ALTER TABLE "analytics_consent_events" ADD CONSTRAINT "analytics_consent_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_consent_events_user_idx" ON "analytics_consent_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "analytics_consent_events_created_idx" ON "analytics_consent_events" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_analytics_consent_complete" CHECK (("users"."analytics_consent" IS NULL AND "users"."analytics_consent_at" IS NULL AND "users"."analytics_consent_source" IS NULL) OR ("users"."analytics_consent" IS NOT NULL AND "users"."analytics_consent_at" IS NOT NULL AND "users"."analytics_consent_source" IS NOT NULL));