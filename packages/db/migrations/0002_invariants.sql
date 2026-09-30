-- Community Pocketbook Phase 1 Invariants (D7, P1.2)
-- Automatic updated_at, default categories, and category protection

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint

CREATE TRIGGER accounts_set_updated_at BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

--> statement-breakpoint

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

--> statement-breakpoint

CREATE TRIGGER decks_set_updated_at BEFORE UPDATE ON decks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

--> statement-breakpoint

CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

--> statement-breakpoint

CREATE TRIGGER items_set_updated_at BEFORE UPDATE ON items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

--> statement-breakpoint

CREATE OR REPLACE FUNCTION create_default_category() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO categories (deck_id, slug, name, is_default, visibility, position)
  VALUES (NEW.id, 'general', 'General', true, 'shared', 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint

CREATE TRIGGER decks_create_default_category AFTER INSERT ON decks FOR EACH ROW EXECUTE FUNCTION create_default_category();

--> statement-breakpoint

CREATE OR REPLACE FUNCTION protect_default_category() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_default AND (
    TG_OP = 'DELETE' OR
    (TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) OR
    (TG_OP = 'UPDATE' AND NEW.is_default = false)
  ) AND pg_trigger_depth() = 1 AND EXISTS (SELECT 1 FROM decks WHERE id = OLD.deck_id) THEN
    RAISE EXCEPTION 'default_category_protected' USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint

CREATE TRIGGER categories_protect_default BEFORE DELETE OR UPDATE OF deleted_at, is_default ON categories FOR EACH ROW EXECUTE FUNCTION protect_default_category();

--> statement-breakpoint

CREATE UNIQUE INDEX categories_one_default_uq ON categories (deck_id) WHERE is_default AND deleted_at IS NULL;
