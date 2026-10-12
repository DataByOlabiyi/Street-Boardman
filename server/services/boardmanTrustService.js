const prisma = require('../config/db');
const AppError = require('../utils/appError');

// A Boardman's public track record and trust score (FEAT-048), so a bettor
// can judge who they're trusting with their stake. Kept deliberately
// simple and explainable, with every input returned alongside the score:
//
//   score = 100 × completed / (completed + 3 × overturned + 0.5 × selfCancelled)
//
// - completed: competitions paid out normally.
// - overturned: a dispute ended with the Boardman's result thrown out
//   (RESOLVED_CANCELLED). Weighs like three completed competitions.
//   Disputes an admin resolved in the Boardman's favour don't count.
// - selfCancelled: the Boardman called a competition off. Weighs half: it
//   costs nobody money, but bettors' plans were disrupted.
// No-contest refunds (one-sided pools) aren't the Boardman's doing and
// don't count. Below MIN_HISTORY settled competitions there's too little
// to go on, so the score is null ("new Boardman").
const MIN_HISTORY = 5;

function scoreFrom({ completed, overturned, selfCancelled }) {
  if (completed + overturned < MIN_HISTORY) return null;
  const weighted = completed + 3 * overturned + 0.5 * selfCancelled;
  return weighted === 0 ? null : Math.round((100 * completed) / weighted);
}

// Batched: one query per signal for any number of Boardmen, so lists of
// competitions don't fan out into a query per Boardman.
async function statsFor(profileIds) {
  const ids = [...new Set(profileIds)];
  const stats = new Map(ids.map((id) => [id, { completed: 0, overturned: 0, disputed: 0, selfCancelled: 0, volume: '0.00' }]));
  if (ids.length === 0) return stats;

  const [completed, disputes, cancels, volume] = await Promise.all([
    prisma.competition.groupBy({
      by: ['boardmanProfileId'],
      where: { boardmanProfileId: { in: ids }, status: 'COMPLETED' },
      _count: true,
    }),
    prisma.$queryRaw`
      SELECT c."boardmanProfileId" AS id,
        COUNT(DISTINCT d."competitionId")::int AS disputed,
        COUNT(DISTINCT d."competitionId") FILTER (WHERE d.status = 'RESOLVED_CANCELLED')::int AS overturned
      FROM "Dispute" d JOIN "Competition" c ON c.id = d."competitionId"
      WHERE c."boardmanProfileId" = ANY(${ids})
      GROUP BY 1`,
    prisma.$queryRaw`
      SELECT c."boardmanProfileId" AS id, COUNT(DISTINCT c.id)::int AS n
      FROM "AuditLog" a JOIN "Competition" c ON c.id = a."entityId"
      WHERE a.action = 'COMPETITION_CANCELLED' AND c."boardmanProfileId" = ANY(${ids})
      GROUP BY 1`,
    prisma.$queryRaw`
      SELECT c."boardmanProfileId" AS id, SUM(cm."totalStakePool") AS total
      FROM "Commission" cm JOIN "Competition" c ON c.id = cm."competitionId"
      WHERE c."boardmanProfileId" = ANY(${ids})
      GROUP BY 1`,
  ]);

  for (const row of completed) stats.get(row.boardmanProfileId).completed = row._count;
  for (const row of disputes) Object.assign(stats.get(row.id), { disputed: row.disputed, overturned: row.overturned });
  for (const row of cancels) stats.get(row.id).selfCancelled = row.n;
  for (const row of volume) stats.get(row.id).volume = Number(row.total || 0).toFixed(2);
  for (const s of stats.values()) s.trustScore = scoreFrom(s);
  return stats;
}

// Public card shown next to a competition: who runs it and how they've done.
async function publicCards(profiles) {
  const stats = await statsFor(profiles.map((p) => p.id));
  return new Map(
    profiles.map((p) => [
      p.id,
      {
        profileId: p.id,
        name: p.user?.fullName,
        location: p.businessLocation,
        trustScore: stats.get(p.id).trustScore,
        completedCompetitions: stats.get(p.id).completed,
      },
    ])
  );
}

async function getPublicProfile(profileId) {
  const profile = await prisma.boardmanProfile.findUnique({
    where: { id: profileId },
    include: { user: { select: { fullName: true, status: true } } },
  });
  if (!profile || profile.approvalStatus !== 'APPROVED' || profile.user.status !== 'ACTIVE') {
    throw new AppError('Boardman not found', 404);
  }
  const stats = (await statsFor([profileId])).get(profileId);
  return {
    profileId,
    name: profile.user.fullName,
    location: profile.businessLocation,
    memberSince: profile.approvedAt,
    trustScore: stats.trustScore,
    track: {
      completedCompetitions: stats.completed,
      disputedCompetitions: stats.disputed,
      resultsOverturned: stats.overturned,
      cancelledByBoardman: stats.selfCancelled,
      totalStakedOnCompleted: stats.volume,
    },
    scoreExplained:
      'Completed competitions, weighed against results thrown out after a dispute (x3) and competitions the Boardman cancelled (x0.5). Shown once 5 competitions have settled.',
  };
}

module.exports = { statsFor, publicCards, getPublicProfile, scoreFrom, MIN_HISTORY };
