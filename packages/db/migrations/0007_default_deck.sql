ALTER TABLE "decks" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "decks_default_per_account_uq" ON "decks" USING btree ("owner_account_id") WHERE is_default AND deleted_at IS NULL;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_default_is_personal" CHECK ((NOT "decks"."is_default" OR "decks"."kind" = 'personal'));--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_slug_not_reserved" CHECK ("decks"."slug" <> 'me');--> statement-breakpoint

CREATE OR REPLACE FUNCTION protect_default_deck() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_default AND (
    TG_OP = 'DELETE' OR
    (TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) OR
    (TG_OP = 'UPDATE' AND NEW.is_default = false)
  ) AND pg_trigger_depth() = 1 AND EXISTS (SELECT 1 FROM accounts WHERE id = OLD.owner_account_id) THEN
    RAISE EXCEPTION 'default_deck_protected' USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint

CREATE TRIGGER decks_protect_default BEFORE DELETE OR UPDATE OF deleted_at, is_default ON decks FOR EACH ROW EXECUTE FUNCTION protect_default_deck();
