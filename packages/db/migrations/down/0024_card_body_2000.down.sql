-- Back to the 600 code point body limit. NOT VALID: bodies already longer than 600 stay as they
-- are (no truncation, no failed rollback); new writes are checked against 600 again.
ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "items_body_len_chk";
ALTER TABLE "items" ADD CONSTRAINT "items_body_len_chk" CHECK (char_length("items"."body") <= 600) NOT VALID;
