-- Back to 0029: invite links are dropped; waitlist entries removed by the D477 tidy are not restored.
ALTER TABLE "magic_links" DROP CONSTRAINT IF EXISTS "magic_links_invite_link_sign_in";
ALTER TABLE "magic_links" DROP COLUMN IF EXISTS "invite_link_id";
DROP TABLE IF EXISTS "deck_invite_links";
