-- Back to 0027: the per-user smart-share flag is dropped.
ALTER TABLE "users" DROP COLUMN IF EXISTS "smart_share";
