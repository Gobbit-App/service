DROP TRIGGER IF EXISTS decks_protect_default ON decks;

--> statement-breakpoint

DROP FUNCTION IF EXISTS protect_default_deck();

--> statement-breakpoint

ALTER TABLE "decks" DROP CONSTRAINT IF EXISTS "decks_slug_not_reserved";

--> statement-breakpoint

ALTER TABLE "decks" DROP CONSTRAINT IF EXISTS "decks_default_is_personal";

--> statement-breakpoint

DROP INDEX IF EXISTS "decks_default_per_account_uq";

--> statement-breakpoint

ALTER TABLE "decks" DROP COLUMN IF EXISTS "is_default";
