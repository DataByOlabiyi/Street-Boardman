const asyncHandler = require('../utils/asyncHandler');
const prisma = require('../config/db');
const walletService = require('../services/walletService');

const getMyWallet = asyncHandler(async (req, res) => {
  const wallet = await walletService.getWalletByUserId(prisma, req.user.id);
  res.json({ wallet });
});

const getMyTransactions = asyncHandler(async (req, res) => {
  const wallet = await walletService.getWalletByUserId(prisma, req.user.id);
  const transactions = await prisma.walletTransaction.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ transactions });
});

module.exports = { getMyWallet, getMyTransactions };
