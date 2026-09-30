-- Gobbit Phase 2 auth invariants (D36, D44)
-- updated_at on memberships; owner-account users never get a membership to their own deck

CREATE TRIGGER memberships_set_updated_at BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION set_updated_at();

--> statement-breakpoint

CREATE OR REPLACE FUNCTION reject_owner_account_membership() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM decks d
      JOIN users u ON u.account_id = d.owner_account_id
     WHERE d.id = NEW.deck_id AND u.id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'owner_account_membership' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint

CREATE TRIGGER memberships_reject_owner_account BEFORE INSERT ON memberships FOR EACH ROW EXECUTE FUNCTION reject_owner_account_membership();
