ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_analytics_consent_complete";
DROP TABLE IF EXISTS "analytics_consent_events";
ALTER TABLE "users" DROP COLUMN IF EXISTS "analytics_consent_source";
ALTER TABLE "users" DROP COLUMN IF EXISTS "analytics_consent_at";
ALTER TABLE "users" DROP COLUMN IF EXISTS "analytics_consent";
DROP TYPE IF EXISTS "public"."analytics_consent_source";
DROP TYPE IF EXISTS "public"."analytics_consent";
