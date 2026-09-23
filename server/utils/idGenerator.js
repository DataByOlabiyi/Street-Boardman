// Generates human-readable, sequential-looking bet codes like "SB-000123".
// Uses a row count instead of a DB sequence to keep the schema simple for
// now; fine for MVP volume, and the DB unique constraint on betCode still
// guarantees no collisions ever get persisted.
async function generateBetCode(prisma) {
  const count = await prisma.bet.count();
  const next = count + 1;
  return `SB-${String(next).padStart(6, '0')}`;
}

module.exports = { generateBetCode };
