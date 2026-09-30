DROP INDEX IF EXISTS categories_one_default_uq;

--> statement-breakpoint

DROP TRIGGER IF EXISTS categories_protect_default ON categories;

--> statement-breakpoint

DROP TRIGGER IF EXISTS decks_create_default_category ON decks;

--> statement-breakpoint

DROP TRIGGER IF EXISTS accounts_set_updated_at ON accounts;

--> statement-breakpoint

DROP TRIGGER IF EXISTS users_set_updated_at ON users;

--> statement-breakpoint

DROP TRIGGER IF EXISTS decks_set_updated_at ON decks;

--> statement-breakpoint

DROP TRIGGER IF EXISTS categories_set_updated_at ON categories;

--> statement-breakpoint

DROP TRIGGER IF EXISTS items_set_updated_at ON items;

--> statement-breakpoint

DROP FUNCTION IF EXISTS protect_default_category();

--> statement-breakpoint

DROP FUNCTION IF EXISTS create_default_category();

--> statement-breakpoint

DROP FUNCTION IF EXISTS set_updated_at();
