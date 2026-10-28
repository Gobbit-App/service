ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_registered_by_users_id_fk";
ALTER TABLE "users" DROP COLUMN IF EXISTS "registered_by";
ALTER TABLE "users" DROP COLUMN IF EXISTS "registered_via";
DROP TYPE IF EXISTS "public"."registration_reason";
