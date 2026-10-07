CREATE TABLE "og_images" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"content_hash" text NOT NULL,
	"public_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "og_images" ADD CONSTRAINT "og_images_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;