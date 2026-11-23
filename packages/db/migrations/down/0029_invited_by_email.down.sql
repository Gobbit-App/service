-- Back to 0028: the invite email-visibility flag is dropped.
ALTER TABLE "memberships" DROP COLUMN IF EXISTS "invited_by_email";
