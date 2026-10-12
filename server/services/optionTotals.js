const crypto = require('crypto');
const prisma = require('../config/db');
const { toDecimal } = require('../utils/money');

// Option stake totals live in BetOptionShard rows (TASK-048): a bet adds to
// one random shard, so concurrent bets on the same option rarely wait on
// each other, and readers sum the shards.
const SHARDS = 16;

// Inside the bet's transaction. The upsert locks one shard row, not the
// whole option.
async function addStake(tx, betOptionId, amount) {
  const shard = crypto.randomInt(SHARDS);
  await tx.$executeRaw`
    INSERT INTO "BetOptionShard" ("betOptionId", "shard", "totalStaked")
    VALUES (${betOptionId}, ${shard}, ${amount})
    ON CONFLICT ("betOptionId", "shard")
    DO UPDATE SET "totalStaked" = "BetOptionShard"."totalStaked" + EXCLUDED."totalStaked"`;
}

async function totalsFor(betOptionIds, client = prisma) {
  const ids = [...new Set(betOptionIds)];
  const totals = new Map(ids.map((id) => [id, toDecimal(0)]));
  if (ids.length === 0) return totals;
  const rows = await client.$queryRaw`
    SELECT "betOptionId" AS id, SUM("totalStaked") AS total
    FROM "BetOptionShard" WHERE "betOptionId" = ANY(${ids}) GROUP BY 1`;
  for (const row of rows) totals.set(row.id, toDecimal(row.total));
  return totals;
}

// Fills option.totalStaked on competitions (or bare option lists) loaded
// with `include: { betOptions: true }`, so API responses keep the shape
// they had when the total was a column. One query for any number.
async function withOptionTotals(competitions, client = prisma) {
  const list = Array.isArray(competitions) ? competitions : [competitions];
  const options = list.flatMap((c) => c.betOptions || []);
  const totals = await totalsFor(options.map((o) => o.id), client);
  for (const option of options) option.totalStaked = totals.get(option.id);
  return competitions;
}

module.exports = { SHARDS, addStake, totalsFor, withOptionTotals };
