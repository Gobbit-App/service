-- D183: drop anonymous public-search rows, then restore the member-only modes.
DELETE FROM "search_queries" WHERE "mode" = 'public';
ALTER TABLE "search_queries" DROP CONSTRAINT "search_queries_mode_chk";
ALTER TABLE "search_queries" ADD CONSTRAINT "search_queries_mode_chk" CHECK ("search_queries"."mode" IN ('search', 'ask'));
