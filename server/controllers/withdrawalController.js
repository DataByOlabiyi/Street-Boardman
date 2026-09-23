const asyncHandler = require('../utils/asyncHandler');
const withdrawalService = require('../services/withdrawalService');

const requestWithdrawal = asyncHandler(async (req, res) => {
  const withdrawal = await withdrawalService.requestWithdrawal(req.user.id, req.body.amount, req.body.destination);
  res.status(201).json({ withdrawal });
});

const listMyWithdrawals = asyncHandler(async (req, res) => {
  const withdrawals = await withdrawalService.listWithdrawalsForUser(req.user.id);
  res.json({ withdrawals });
});

const adminProcessWithdrawal = asyncHandler(async (req, res) => {
  const withdrawal = await withdrawalService.processWithdrawal(req.params.id, req.user.id);
  res.json({ withdrawal });
});

const adminRejectWithdrawal = asyncHandler(async (req, res) => {
  const withdrawal = await withdrawalService.rejectWithdrawal(req.params.id, req.user.id, req.body.reason);
  res.json({ withdrawal });
});

module.exports = { requestWithdrawal, listMyWithdrawals, adminProcessWithdrawal, adminRejectWithdrawal };
