CREATE TYPE "public"."registration_reason" AS ENUM('deck_invite', 'waitlist_invite', 'open_sign_in');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "registered_via" "registration_reason";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "registered_by" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;