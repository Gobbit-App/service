-- Back to 0030: the welcome dismissal column is dropped.
ALTER TABLE "memberships" DROP COLUMN IF EXISTS "welcome_dismissed_at";
