ALTER TABLE "search_queries" DROP CONSTRAINT "search_queries_mode_chk";--> statement-breakpoint
ALTER TABLE "search_queries" ADD CONSTRAINT "search_queries_mode_chk" CHECK ("search_queries"."mode" IN ('search', 'ask', 'public'));
