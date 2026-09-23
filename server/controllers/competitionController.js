const asyncHandler = require('../utils/asyncHandler');
const prisma = require('../config/db');
const competitionService = require('../services/competitionService');

const createCompetition = asyncHandler(async (req, res) => {
  const competition = await competitionService.createCompetition(req.boardmanProfile, req.body);
  res.status(201).json({ competition });
});

const listOpenCompetitions = asyncHandler(async (req, res) => {
  const competitions = await competitionService.listOpenCompetitions();
  res.json({ competitions });
});

const getCompetition = asyncHandler(async (req, res) => {
  const competition = await competitionService.getCompetitionById(req.params.id);
  res.json({ competition });
});

const closeBetting = asyncHandler(async (req, res) => {
  const competition = await competitionService.closeBetting(req.boardmanProfile.id, req.params.id);
  res.json({ competition });
});

const listMyCompetitions = asyncHandler(async (req, res) => {
  const competitions = await prisma.competition.findMany({
    where: { boardmanProfileId: req.boardmanProfile.id },
    include: { betOptions: true, result: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ competitions });
});

const listBetsForMyCompetition = asyncHandler(async (req, res) => {
  const competition = await prisma.competition.findUnique({ where: { id: req.params.id } });
  if (!competition || competition.boardmanProfileId !== req.boardmanProfile.id) {
    return res.status(403).json({ error: 'You can only view bets on your own competitions' });
  }
  const bets = await prisma.bet.findMany({
    where: { competitionId: req.params.id },
    include: { better: { select: { fullName: true, phone: true } }, betOption: true },
    orderBy: { placedAt: 'desc' },
  });
  res.json({ bets });
});

module.exports = {
  createCompetition,
  listOpenCompetitions,
  getCompetition,
  closeBetting,
  listMyCompetitions,
  listBetsForMyCompetition,
};
