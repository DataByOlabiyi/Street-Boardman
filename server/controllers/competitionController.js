const asyncHandler = require('../utils/asyncHandler');
const prisma = require('../config/db');
const competitionService = require('../services/competitionService');
const { withOptionTotals } = require('../services/optionTotals');
const AppError = require('../utils/appError');
const { browseCompetitionsQuery } = require('../validators/schemas');

const createCompetition = asyncHandler(async (req, res) => {
  const competition = await competitionService.createCompetition(req.boardmanProfile, req.body);
  res.status(201).json({ competition });
});

const listOpenCompetitions = asyncHandler(async (req, res) => {
  const parsed = browseCompetitionsQuery.safeParse(req.query);
  if (!parsed.success) throw new AppError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '), 422);
  res.json(await competitionService.listOpenCompetitions(parsed.data));
});

const getCompetition = asyncHandler(async (req, res) => {
  const competition = await competitionService.getPublicCompetition(req.params.id);
  res.json({ competition });
});

const getLivePool = asyncHandler(async (req, res) => {
  res.json(await competitionService.getLivePool(req.params.id));
});

const closeBetting = asyncHandler(async (req, res) => {
  const competition = await competitionService.closeBetting(req.boardmanProfile.id, req.params.id);
  res.json({ competition });
});

const updateCompetition = asyncHandler(async (req, res) => {
  const competition = await competitionService.updateCompetition(
    req.boardmanProfile.id,
    req.params.id,
    req.body,
    req.user.id
  );
  res.json({ competition });
});

const cancelCompetition = asyncHandler(async (req, res) => {
  const result = await competitionService.cancelCompetition(
    req.boardmanProfile.id,
    req.params.id,
    req.body.reason,
    req.user.id
  );
  res.json(result);
});

const listMyCompetitions = asyncHandler(async (req, res) => {
  const competitions = await prisma.competition.findMany({
    where: { boardmanProfileId: req.boardmanProfile.id },
    include: { betOptions: true, result: true },
    orderBy: { createdAt: 'desc' },
  });
  await withOptionTotals(competitions);
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
  getLivePool,
  closeBetting,
  updateCompetition,
  cancelCompetition,
  listMyCompetitions,
  listBetsForMyCompetition,
};
