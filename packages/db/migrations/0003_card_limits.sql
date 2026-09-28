ALTER TABLE "items" ADD CONSTRAINT "items_body_len_chk" CHECK (char_length("items"."body") <= 600);--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_payload_size_chk" CHECK (octet_length("items"."payload"::text) <= 9216);--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_payload_object_chk" CHECK (jsonb_typeof("items"."payload") = 'object');