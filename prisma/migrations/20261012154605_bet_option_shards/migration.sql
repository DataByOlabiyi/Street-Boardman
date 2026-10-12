-- Option stake totals move from one row per option to sharded rows
-- (TASK-048). Order matters: copy the existing totals into shard 0 before
-- the old column is dropped, so no live competition loses its pool.

-- CreateTable
CREATE TABLE "BetOptionShard" (
    "betOptionId" TEXT NOT NULL,
    "shard" INTEGER NOT NULL,
    "totalStaked" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "BetOptionShard_pkey" PRIMARY KEY ("betOptionId","shard")
);

-- AddForeignKey
ALTER TABLE "BetOptionShard" ADD CONSTRAINT "BetOptionShard_betOptionId_fkey" FOREIGN KEY ("betOptionId") REFERENCES "BetOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill
INSERT INTO "BetOptionShard" ("betOptionId", "shard", "totalStaked")
SELECT "id", 0, "totalStaked" FROM "BetOption" WHERE "totalStaked" <> 0;

-- Refuse to drop the column unless every total was copied exactly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "BetOption" o
    LEFT JOIN "BetOptionShard" s ON s."betOptionId" = o."id"
    GROUP BY o."id", o."totalStaked"
    HAVING o."totalStaked" <> COALESCE(SUM(s."totalStaked"), 0)
  ) THEN
    RAISE EXCEPTION 'BetOptionShard backfill does not match BetOption.totalStaked';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "BetOption" DROP COLUMN "totalStaked";
