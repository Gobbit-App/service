ALTER TABLE "items" DROP CONSTRAINT "items_body_len_chk";--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_body_len_chk" CHECK (char_length("items"."body") <= 2000);