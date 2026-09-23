const prisma = require('../config/db');
const AppError = require('../utils/appError');
const walletService = require('./walletService');
const commissionService = require('./commissionService');
const { toDecimal } = require('../utils/money');

// Runs once per competition, exactly once, when a result becomes CONFIRMED.
// Idempotency is enforced two ways:
//  1. The status flip below (RESULT_CONFIRMED -> PAYOUT_PROCESSING) only
//     succeeds for whichever caller gets there first; a duplicate trigger
//     (e.g. the cron sweep and an admin click landing at the same time)
//     finds updateMany matched 0 rows and simply stops.
//  2. Each Payout row has a unique idempotencyKey derived from the betId,
//     so even a retried transaction can't create two payouts for one bet.
async function processPayoutsForCompetition(competitionId) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.competition.updateMany({
      where: { id: competitionId, status: 'RESULT_CONFIRMED' },
      data: { status: 'PAYOUT_PROCESSING' },
    });
    if (claim.count === 0) {
      return { skipped: true, reason: 'Already processed or not ready for payout' };
    }

    const competition = await tx.competition.findUnique({
      where: { id: competitionId },
      include: { result: true, betOptions: { include: { bets: true } } },
    });
    const result = competition.result;
    if (!result) throw new AppError('Competition has no result to pay out on', 400);

    const allBets = competition.betOptions.flatMap((o) => o.bets);
    const totalStakePool = allBets.reduce((sum, b) => sum.plus(toDecimal(b.stake)), toDecimal(0));

    const commission = commissionService.calculateCommission(
      totalStakePool,
      competition.boardmanCommissionRate,
      competition.platformCommissionRate
    );

    const winningOption = competition.betOptions.find((o) => o.id === result.winningOptionId);
    const winningBets = winningOption.bets.filter((b) => b.status === 'OPEN');
    const payouts = commissionService.calculateWinnerPayouts(
      winningBets,
      winningOption.totalStaked,
      commission.distributablePool
    );

    for (const { betId, amount } of payouts) {
      const bet = winningBets.find((b) => b.id === betId);
      const wallet = await walletService.getWalletByUserId(tx, bet.betterId);
      const payout = await tx.payout.create({
        data: { betId, amount, status: 'PENDING', idempotencyKey: `payout:${betId}` },
      });
      await walletService.applyWalletTransaction(tx, {
        walletId: wallet.id,
        type: 'BET_WIN',
        delta: amount,
        referenceType: 'Payout',
        referenceId: payout.id,
        note: `Winnings — ${competition.title}`,
      });
      await tx.payout.update({ where: { id: payout.id }, data: { status: 'PROCESSED', processedAt: new Date() } });
      await tx.bet.update({ where: { id: betId }, data: { status: 'WON' } });
    }

    const losingBets = allBets.filter((b) => b.status === 'OPEN' && b.betOptionId !== winningOption.id);
    if (losingBets.length > 0) {
      await tx.bet.updateMany({
        where: { id: { in: losingBets.map((b) => b.id) } },
        data: { status: 'LOST' },
      });
    }

    const boardmanUserId = (
      await tx.boardmanProfile.findUnique({ where: { id: competition.boardmanProfileId } })
    ).userId;
    const boardmanWallet = await walletService.getWalletByUserId(tx, boardmanUserId);
    const platformWallet = await walletService.getPlatformWallet(tx);

    const commissionRow = await tx.commission.create({
      data: {
        competitionId,
        boardmanId: boardmanUserId,
        totalStakePool: commission.totalStakePool,
        boardmanAmount: commission.boardmanAmount,
        platformAmount: commission.platformAmount,
      },
    });

    await walletService.applyWalletTransaction(tx, {
      walletId: boardmanWallet.id,
      type: 'COMMISSION',
      delta: commission.boardmanAmount,
      referenceType: 'Commission',
      referenceId: commissionRow.id,
      note: `Boardman commission — ${competition.title}`,
    });
    await walletService.applyWalletTransaction(tx, {
      walletId: platformWallet.id,
      type: 'COMMISSION',
      delta: commission.platformAmount,
      referenceType: 'Commission',
      referenceId: commissionRow.id,
      note: `Platform commission — ${competition.title}`,
    });

    await tx.competition.update({ where: { id: competitionId }, data: { status: 'COMPLETED' } });

    return { skipped: false, payoutsCount: payouts.length, commission: commissionRow };
  });
}

// Cancels a competition and refunds every stake with no commission taken.
// Used for Admin-resolved disputes that go the "cancel" route, or a
// Boardman cancelling before any real-world result exists.
async function cancelAndRefundCompetition(competitionId) {
  return prisma.$transaction(async (tx) => {
    const competition = await tx.competition.findUnique({
      where: { id: competitionId },
      include: { betOptions: { include: { bets: true } } },
    });
    if (!competition) throw new AppError('Competition not found', 404);
    if (['COMPLETED', 'CANCELLED_REFUNDED'].includes(competition.status)) {
      return { skipped: true, reason: 'Already finalized' };
    }

    const openBets = competition.betOptions.flatMap((o) => o.bets).filter((b) => b.status === 'OPEN');
    for (const bet of openBets) {
      const wallet = await walletService.getWalletByUserId(tx, bet.betterId);
      await walletService.applyWalletTransaction(tx, {
        walletId: wallet.id,
        type: 'REFUND',
        delta: bet.stake,
        referenceType: 'Bet',
        referenceId: bet.id,
        note: `Refund — ${competition.title} cancelled`,
      });
      await tx.bet.update({ where: { id: bet.id }, data: { status: 'REFUNDED' } });
    }

    await tx.competition.update({ where: { id: competitionId }, data: { status: 'CANCELLED_REFUNDED' } });
    return { skipped: false, refundedCount: openBets.length };
  });
}

module.exports = { processPayoutsForCompetition, cancelAndRefundCompetition };
