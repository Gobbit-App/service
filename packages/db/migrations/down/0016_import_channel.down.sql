DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ingest_jobs" WHERE "channel" = 'import') THEN
    RAISE EXCEPTION 'ingest_jobs still has import jobs; delete them before rolling back 0016_import_channel';
  END IF;
END $$;
ALTER TYPE "public"."ingest_channel" RENAME TO "ingest_channel_old";
CREATE TYPE "public"."ingest_channel" AS ENUM('pwa', 'shortcut', 'email', 'paste', 'mcp');
ALTER TABLE "ingest_jobs" ALTER COLUMN "channel" TYPE "public"."ingest_channel" USING "channel"::text::"public"."ingest_channel";
DROP TYPE "public"."ingest_channel_old";
