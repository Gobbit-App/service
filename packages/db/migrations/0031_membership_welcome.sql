ALTER TABLE "memberships" ADD COLUMN "welcome_dismissed_at" timestamp (3) with time zone;
--> statement-breakpoint
-- D478: members already in a deck have nothing to welcome; pending rows stay null.
UPDATE memberships SET welcome_dismissed_at = accepted_at WHERE accepted_at IS NOT NULL;
