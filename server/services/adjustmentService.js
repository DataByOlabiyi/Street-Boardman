const prisma = require('../config/db');
const AppError = require('../utils/appError');
const walletService = require('./walletService');
const { toDecimal, round2 } = require('../utils/money');
const { recordAuditLog } = require('../middleware/auditLog');
const { STAFF_VISIBLE_USER_FIELDS } = require('../utils/userSelect');

// Manual balance corrections, maker-checker (FEAT-047): one staff member
// proposes, a different one approves, and only the approval moves money,
// through the same ledger path as everything else. Nothing here can edit
// a balance directly.
const MAX_ADJUSTMENT_NGN = 1_000_000;

async function requestAdjustment({ userId, amount, reason }, requestedById) {
  const amountDecimal = round2(toDecimal(amount));
  if (amountDecimal.isZero()) throw new AppError('Adjustment amount cannot be zero', 422);
  if (amountDecimal.abs().gt(MAX_ADJUSTMENT_NGN)) {
    throw new AppError(`Adjustments are limited to ₦${MAX_ADJUSTMENT_NGN.toLocaleString('en-NG')}`, 422);
  }
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet || wallet.walletType === 'PLATFORM') {
    throw new AppError('Only a Better or Boardman wallet can be adjusted', 422);
  }

  return prisma.$transaction(async (tx) => {
    const adjustment = await tx.walletAdjustment.create({
      data: { walletId: wallet.id, amount: amountDecimal, reason, requestedById },
    });
    await recordAuditLog(
      {
        actorUserId: requestedById,
        action: 'WALLET_ADJUSTMENT_REQUESTED',
        entityType: 'WalletAdjustment',
        entityId: adjustment.id,
        afterState: { userId, amount: amountDecimal.toString(), reason },
      },
      tx
    );
    return adjustment;
  });
}

// The claim (PENDING -> APPROVED, requester excluded) and the wallet change
// commit together: if the debit would overdraw the wallet, the whole thing
// rolls back and the adjustment stays PENDING.
async function approveAdjustment(adjustmentId, reviewerId, note) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.walletAdjustment.updateMany({
      where: { id: adjustmentId, status: 'PENDING', requestedById: { not: reviewerId } },
      data: { status: 'APPROVED', reviewedById: reviewerId, reviewedAt: new Date(), reviewNote: note || null },
    });
    if (claim.count === 0) await explainFailedClaim(tx, adjustmentId, reviewerId);

    const adjustment = await tx.walletAdjustment.findUnique({ where: { id: adjustmentId } });
    await walletService.applyWalletTransaction(tx, {
      walletId: adjustment.walletId,
      type: 'ADJUSTMENT',
      delta: adjustment.amount,
      referenceType: 'WalletAdjustment',
      referenceId: adjustment.id,
      note: `Manual adjustment: ${adjustment.reason}`,
      counterparty: { type: 'EXTERNAL' },
    });
    await recordAuditLog(
      {
        actorUserId: reviewerId,
        action: 'WALLET_ADJUSTMENT_APPROVED',
        entityType: 'WalletAdjustment',
        entityId: adjustmentId,
        beforeState: { status: 'PENDING' },
        afterState: { status: 'APPROVED', amount: adjustment.amount.toString(), note: note || null },
      },
      tx
    );
    return adjustment;
  });
}

async function rejectAdjustment(adjustmentId, reviewerId, note) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.walletAdjustment.updateMany({
      where: { id: adjustmentId, status: 'PENDING', requestedById: { not: reviewerId } },
      data: { status: 'REJECTED', reviewedById: reviewerId, reviewedAt: new Date(), reviewNote: note },
    });
    if (claim.count === 0) await explainFailedClaim(tx, adjustmentId, reviewerId);
    await recordAuditLog(
      {
        actorUserId: reviewerId,
        action: 'WALLET_ADJUSTMENT_REJECTED',
        entityType: 'WalletAdjustment',
        entityId: adjustmentId,
        beforeState: { status: 'PENDING' },
        afterState: { status: 'REJECTED', note },
      },
      tx
    );
    return tx.walletAdjustment.findUnique({ where: { id: adjustmentId } });
  });
}

async function explainFailedClaim(tx, adjustmentId, reviewerId) {
  const existing = await tx.walletAdjustment.findUnique({ where: { id: adjustmentId } });
  if (!existing) throw new AppError('Adjustment not found', 404);
  if (existing.status !== 'PENDING') throw new AppError('Adjustment already reviewed', 400);
  if (existing.requestedById === reviewerId) {
    throw new AppError('A different staff member has to review an adjustment you requested', 403);
  }
  throw new AppError('Adjustment could not be reviewed', 409);
}

const adjustmentInclude = {
  wallet: { select: { id: true, walletType: true, user: { select: STAFF_VISIBLE_USER_FIELDS } } },
  requestedBy: { select: { id: true, fullName: true } },
  reviewedBy: { select: { id: true, fullName: true } },
};

module.exports = {
  MAX_ADJUSTMENT_NGN,
  requestAdjustment,
  approveAdjustment,
  rejectAdjustment,
  adjustmentInclude,
};
