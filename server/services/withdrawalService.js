const prisma = require('../config/db');
const AppError = require('../utils/appError');
const walletService = require('./walletService');
const { toDecimal, round2 } = require('../utils/money');
const { recordAuditLog } = require('../middleware/auditLog');

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

// The status flip is the ONLY thing that decides whether a withdrawal gets
// processed or rejected. It's a single conditional update (PENDING -> new
// status) rather than a find-then-update, so two concurrent admin actions
// on the same withdrawal can never both succeed — whichever call loses the
// race finds updateMany matched 0 rows and gets a clean error instead of
// double-processing it (TASK-002).
async function processWithdrawal(withdrawalId, adminUserId) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.withdrawal.updateMany({
      where: { id: withdrawalId, status: 'PENDING' },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });
    if (claim.count === 0) {
      const existing = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
      if (!existing) throw new AppError('Withdrawal not found', 404);
      throw new AppError('Withdrawal already handled', 400);
    }
    await recordAuditLog(
      {
        actorUserId: adminUserId,
        action: 'WITHDRAWAL_PROCESSED',
        entityType: 'Withdrawal',
        entityId: withdrawalId,
        beforeState: { status: 'PENDING' },
        afterState: { status: 'PROCESSED' },
      },
      tx
    );
    return tx.withdrawal.findUnique({ where: { id: withdrawalId } });
  });
}

// Rejecting a withdrawal returns the held funds to the user's wallet as an
// ADJUSTMENT, with a clear note — never a silent balance edit. The claim
// (conditional status update) runs first, inside the same transaction as
// the refund, so a losing concurrent call rolls back before it can touch
// the wallet at all.
async function rejectWithdrawal(withdrawalId, adminUserId, reasonNote) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.withdrawal.updateMany({
      where: { id: withdrawalId, status: 'PENDING' },
      data: { status: 'REJECTED', processedAt: new Date() },
    });
    if (claim.count === 0) {
      const existing = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
      if (!existing) throw new AppError('Withdrawal not found', 404);
      throw new AppError('Withdrawal already handled', 400);
    }

    const withdrawal = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
    const wallet = await walletService.getWalletByUserId(tx, withdrawal.userId);
    await walletService.applyWalletTransaction(tx, {
      walletId: wallet.id,
      type: 'ADJUSTMENT',
      delta: withdrawal.amount,
      referenceType: 'Withdrawal',
      referenceId: withdrawal.id,
      note: reasonNote || 'Withdrawal rejected — funds returned',
    });
    await recordAuditLog(
      {
        actorUserId: adminUserId,
        action: 'WITHDRAWAL_REJECTED',
        entityType: 'Withdrawal',
        entityId: withdrawalId,
        beforeState: { status: 'PENDING' },
        afterState: { status: 'REJECTED', reason: reasonNote || null },
      },
      tx
    );
    return withdrawal;
  });
}

module.exports = { requestWithdrawal, listWithdrawalsForUser, processWithdrawal, rejectWithdrawal };
