-- Back to 0026: profile fields, avatars and username holds are dropped; profile-scope assets are deleted (their images are not recoverable here).
DROP TRIGGER IF EXISTS users_username_hold_guard ON users;
DROP FUNCTION IF EXISTS users_username_hold_guard_fn();
DROP TABLE IF EXISTS "profile_events";
DROP TABLE IF EXISTS "username_holds";
-- deck_id has to be non-null again, so profile assets (deck_id IS NULL) go first.
DELETE FROM "assets" WHERE "scope" = 'profile';
DROP INDEX IF EXISTS "assets_owner_idx";
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_scope_chk";
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_scope_values_chk";
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_owner_user_id_users_id_fk";
ALTER TABLE "assets" DROP COLUMN IF EXISTS "owner_user_id";
ALTER TABLE "assets" DROP COLUMN IF EXISTS "scope";
ALTER TABLE "assets" ALTER COLUMN "deck_id" SET NOT NULL;
DROP INDEX IF EXISTS "users_username_lower_uq";
DROP INDEX IF EXISTS "users_avatar_public_id_idx";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_username_format_chk";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_first_name_chk";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_last_name_chk";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_location_chk";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_avatar_shape_chk";
ALTER TABLE "users" DROP COLUMN IF EXISTS "username";
ALTER TABLE "users" DROP COLUMN IF EXISTS "first_name";
ALTER TABLE "users" DROP COLUMN IF EXISTS "last_name";
ALTER TABLE "users" DROP COLUMN IF EXISTS "location";
ALTER TABLE "users" DROP COLUMN IF EXISTS "avatar";
