const prisma = require('../config/db');
const AppError = require('../utils/appError');
const settingsService = require('./settingsService');
const { SETTING_KEYS } = require('../config/constants');

async function createCompetition(boardmanProfile, { title, description, category, bettingDeadline, participants, options }) {
  if (boardmanProfile.approvalStatus !== 'APPROVED') {
    throw new AppError('Your Boardman account is not approved yet', 403);
  }
  if (new Date(bettingDeadline) <= new Date()) {
    throw new AppError('Betting deadline must be in the future', 422);
  }
  if (!options || options.length < 2) {
    throw new AppError('A competition needs at least two betting options', 422);
  }

  const boardmanRate = boardmanProfile.commissionRateOverride
    ?? (await settingsService.getSetting(SETTING_KEYS.BOARDMAN_COMMISSION_RATE));
  const platformRate = await settingsService.getSetting(SETTING_KEYS.PLATFORM_COMMISSION_RATE);

  // Combined commission can never reach or exceed the whole pool — winners
  // would be paid less than they staked even when a genuine winning side
  // exists (TASK-007).
  if (boardmanRate + platformRate >= 1) {
    throw new AppError('Combined Boardman and platform commission rates must be below 100%', 422);
  }

  return prisma.competition.create({
    data: {
      boardmanProfileId: boardmanProfile.id,
      title,
      description,
      category,
      bettingDeadline: new Date(bettingDeadline),
      boardmanCommissionRate: boardmanRate,
      platformCommissionRate: platformRate,
      status: 'BETTING_OPEN',
      participants: { create: (participants || []).map((name) => ({ name })) },
      betOptions: { create: options.map((label) => ({ label })) },
    },
    include: { participants: true, betOptions: true },
  });
}

async function listOpenCompetitions() {
  return prisma.competition.findMany({
    where: { status: 'BETTING_OPEN' },
    include: { betOptions: true, participants: true },
    orderBy: { bettingDeadline: 'asc' },
  });
}

async function getCompetitionById(id) {
  const competition = await prisma.competition.findUnique({
    where: { id },
    include: { betOptions: true, participants: true, result: true },
  });
  if (!competition) throw new AppError('Competition not found', 404);
  return competition;
}

async function closeBetting(boardmanProfileId, competitionId) {
  const competition = await getCompetitionById(competitionId);
  if (competition.boardmanProfileId !== boardmanProfileId) {
    throw new AppError('You can only manage your own competitions', 403);
  }
  if (competition.status !== 'BETTING_OPEN') {
    throw new AppError('Betting is not open on this competition', 400);
  }
  return prisma.competition.update({
    where: { id: competitionId },
    data: { status: 'BETTING_CLOSED' },
  });
}

// Called by a scheduled sweep (see server/jobs) so betting also closes
// automatically once the deadline passes, even if the Boardman forgets.
async function autoCloseExpiredCompetitions() {
  const result = await prisma.competition.updateMany({
    where: { status: 'BETTING_OPEN', bettingDeadline: { lte: new Date() } },
    data: { status: 'BETTING_CLOSED' },
  });
  return result.count;
}

module.exports = {
  createCompetition,
  listOpenCompetitions,
  getCompetitionById,
  closeBetting,
  autoCloseExpiredCompetitions,
};
