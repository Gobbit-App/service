-- Back to 0025: covers are dropped with the column (the images are then unreferenced and swept by media-sweep).
DROP INDEX IF EXISTS "items_cover_public_id_idx";
ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "items_cover_chk";
ALTER TABLE "items" DROP COLUMN IF EXISTS "cover";
