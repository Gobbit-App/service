CREATE TABLE "deck_invite_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deck_id" uuid NOT NULL,
	"token" text NOT NULL,
	"name" text NOT NULL,
	"role" "member_role" NOT NULL,
	"created_by" uuid,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"accepted_at" timestamp (3) with time zone,
	"accepted_by" uuid,
	"revoked_at" timestamp (3) with time zone,
	"revoked_by" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deck_invite_links_token_unique" UNIQUE("token"),
	CONSTRAINT "deck_invite_links_name_len" CHECK (char_length("deck_invite_links"."name") between 1 and 60),
	CONSTRAINT "deck_invite_links_role_not_owner" CHECK ("deck_invite_links"."role" <> 'owner'),
	CONSTRAINT "deck_invite_links_one_outcome" CHECK (num_nonnulls("deck_invite_links"."accepted_at", "deck_invite_links"."revoked_at") <= 1),
	CONSTRAINT "deck_invite_links_accepted_by" CHECK ("deck_invite_links"."accepted_at" is not null or "deck_invite_links"."accepted_by" is null)
);
--> statement-breakpoint
ALTER TABLE "magic_links" ADD COLUMN "invite_link_id" uuid;--> statement-breakpoint
ALTER TABLE "deck_invite_links" ADD CONSTRAINT "deck_invite_links_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_invite_links" ADD CONSTRAINT "deck_invite_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_invite_links" ADD CONSTRAINT "deck_invite_links_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_invite_links" ADD CONSTRAINT "deck_invite_links_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deck_invite_links_deck_created_idx" ON "deck_invite_links" USING btree ("deck_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_invite_link_id_deck_invite_links_id_fk" FOREIGN KEY ("invite_link_id") REFERENCES "public"."deck_invite_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_invite_link_sign_in" CHECK ("magic_links"."invite_link_id" is null or "magic_links"."purpose" = 'sign_in');--> statement-breakpoint
CREATE TRIGGER deck_invite_links_set_updated_at BEFORE UPDATE ON deck_invite_links FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- D477: live pending/confirmed waitlist entries whose address already has an account are removed (no actor).
WITH gone AS (
	UPDATE waitlist_entries w SET status = 'removed', removed_at = now(), removed_by = NULL
	WHERE w.status IN ('pending', 'confirmed') AND EXISTS (SELECT 1 FROM users u WHERE lower(btrim(u.email)) = w.email)
	RETURNING w.id
)
INSERT INTO waitlist_events (entry_id, action, actor_id) SELECT id, 'removed', NULL FROM gone;
