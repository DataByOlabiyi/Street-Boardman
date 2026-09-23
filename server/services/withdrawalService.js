const prisma = require('../config/db');
const AppError = require('../utils/appError');
const walletService = require('./walletService');
const { toDecimal, round2 } = require('../utils/money');

// Withdrawals are two-step: requesting one immediately debits the wallet
// (so the user can't spend the same money twice while it's "pending"), and
// an Admin/queue later marks it PROCESSED (money actually sent) or
// REJECTED (money returned to the wallet).
async function requestWithdrawal(userId, amount, destination) {
  const amountDecimal = round2(toDecimal(amount));
  if (amountDecimal.lte(0)) throw new AppError('Withdrawal amount must be positive', 422);

  return prisma.$transaction(async (tx) => {
    const wallet = await walletService.getWalletByUserId(tx, userId);
    const withdrawal = await tx.withdrawal.create({
      data: { userId, amount: amountDecimal, destination, status: 'PENDING' },
    });
    await walletService.applyWalletTransaction(tx, {
      walletId: wallet.id,
      type: 'WITHDRAWAL',
      delta: amountDecimal.negated(),
      referenceType: 'Withdrawal',
      referenceId: withdrawal.id,
      note: 'Withdrawal request',
    });
    return withdrawal;
  });
}

async function listWithdrawalsForUser(userId) {
  return prisma.withdrawal.findMany({ where: { userId }, orderBy: { requestedAt: 'desc' } });
}

async function processWithdrawal(withdrawalId, adminUserId) {
  const withdrawal = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
  if (!withdrawal) throw new AppError('Withdrawal not found', 404);
  if (withdrawal.status !== 'PENDING') throw new AppError('Withdrawal already handled', 400);

  return prisma.withdrawal.update({
    where: { id: withdrawalId },
    data: { status: 'PROCESSED', processedAt: new Date() },
  });
}

// Rejecting a withdrawal returns the held funds to the user's wallet as an
// ADJUSTMENT, with a clear note — never a silent balance edit.
async function rejectWithdrawal(withdrawalId, adminUserId, reasonNote) {
  const withdrawal = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
  if (!withdrawal) throw new AppError('Withdrawal not found', 404);
  if (withdrawal.status !== 'PENDING') throw new AppError('Withdrawal already handled', 400);

  return prisma.$transaction(async (tx) => {
    const wallet = await walletService.getWalletByUserId(tx, withdrawal.userId);
    await walletService.applyWalletTransaction(tx, {
      walletId: wallet.id,
      type: 'ADJUSTMENT',
      delta: withdrawal.amount,
      referenceType: 'Withdrawal',
      referenceId: withdrawal.id,
      note: reasonNote || 'Withdrawal rejected — funds returned',
    });
    return tx.withdrawal.update({
      where: { id: withdrawalId },
      data: { status: 'REJECTED', processedAt: new Date() },
    });
  });
}

module.exports = { requestWithdrawal, listWithdrawalsForUser, processWithdrawal, rejectWithdrawal };
