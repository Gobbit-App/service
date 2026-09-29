DROP TRIGGER IF EXISTS memberships_reject_owner_account ON memberships;

--> statement-breakpoint

DROP TRIGGER IF EXISTS memberships_set_updated_at ON memberships;

--> statement-breakpoint

DROP FUNCTION IF EXISTS reject_owner_account_membership();
