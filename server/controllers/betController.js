const asyncHandler = require('../utils/asyncHandler');
const bettingService = require('../services/bettingService');

const placeBet = asyncHandler(async (req, res) => {
  const bet = await bettingService.placeBet({
    betterId: req.user.id,
    betOptionId: req.body.betOptionId,
    stake: req.body.stake,
  });
  res.status(201).json({ bet });
});

const listMyBets = asyncHandler(async (req, res) => {
  const bets = await bettingService.listBetsForBetter(req.user.id);
  res.json({ bets });
});

const getTicket = asyncHandler(async (req, res) => {
  const bet = await bettingService.getBetByCode(req.params.betCode, req.user.id);
  res.json({ bet });
});

module.exports = { placeBet, listMyBets, getTicket };
