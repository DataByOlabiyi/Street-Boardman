const prisma = require('../config/db');
const AppError = require('../utils/appError');
const settingsService = require('./settingsService');
const payoutService = require('./payoutService');
const { SETTING_KEYS } = require('../config/constants');

async function submitResult(boardmanProfile, competitionId, { winningOptionId, finalScore, evidenceUrls, notes }) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: { betOptions: true, result: true },
  });
  if (!competition) throw new AppError('Competition not found', 404);
  if (competition.boardmanProfileId !== boardmanProfile.id) {
    throw new AppError('You can only submit results for your own competitions', 403);
  }
  if (competition.status !== 'BETTING_CLOSED') {
    throw new AppError('Close betting before submitting a result', 400);
  }
  if (!competition.betOptions.some((o) => o.id === winningOptionId)) {
    throw new AppError('That betting option does not belong to this competition', 422);
  }

  const windowHours = await settingsService.getSetting(SETTING_KEYS.RESULT_CONFIRMATION_WINDOW_HOURS);
  const confirmationDeadline = new Date(Date.now() + windowHours * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const result = await tx.result.create({
      data: {
        competitionId,
        submittedByUserId: boardmanProfile.userId,
        winningOptionId,
        finalScore,
        evidenceUrls: evidenceUrls || [],
        notes,
        status: 'PENDING_CONFIRMATION',
        confirmationDeadline,
      },
    });
    await tx.competition.update({ where: { id: competitionId }, data: { status: 'PENDING_CONFIRMATION' } });
    return result;
  });
}

async function raiseDispute(userId, competitionId, reason) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: { result: true },
  });
  if (!competition || !competition.result) throw new AppError('No result to dispute yet', 404);
  if (competition.result.status !== 'PENDING_CONFIRMATION') {
    throw new AppError('This result can no longer be disputed', 400);
  }

  return prisma.$transaction(async (tx) => {
    const dispute = await tx.dispute.create({
      data: { competitionId, raisedByUserId: userId, reason, status: 'OPEN' },
    });
    await tx.result.update({ where: { competitionId }, data: { status: 'DISPUTED' } });
    await tx.competition.update({ where: { id: competitionId }, data: { status: 'DISPUTED' } });
    return dispute;
  });
}

// Admin-only. Either confirms the disputed result (payout proceeds, possibly
// with the winning option Admin decides on) or cancels the competition
// entirely with a full refund.
async function resolveDispute(adminUserId, disputeId, { action, winningOptionId }) {
  const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } });
  if (!dispute) throw new AppError('Dispute not found', 404);
  if (dispute.status !== 'OPEN' && dispute.status !== 'UNDER_REVIEW') {
    throw new AppError('Dispute already resolved', 400);
  }

  if (action === 'CANCEL') {
    await prisma.$transaction(async (tx) => {
      await tx.dispute.update({
        where: { id: disputeId },
        data: { status: 'RESOLVED_CANCELLED', resolvedByAdminId: adminUserId, resolvedAt: new Date() },
      });
      await tx.result.update({
        where: { competitionId: dispute.competitionId },
        data: { status: 'CANCELLED' },
      });
    });
    return payoutService.cancelAndRefundCompetition(dispute.competitionId);
  }

  if (action === 'CONFIRM') {
    await prisma.$transaction(async (tx) => {
      const result = await tx.result.findUnique({ where: { competitionId: dispute.competitionId } });
      await tx.result.update({
        where: { competitionId: dispute.competitionId },
        data: {
          status: 'CONFIRMED',
          winningOptionId: winningOptionId || result.winningOptionId,
          confirmedByAdminId: adminUserId,
          confirmedAt: new Date(),
        },
      });
      await tx.competition.update({ where: { id: dispute.competitionId }, data: { status: 'RESULT_CONFIRMED' } });
      await tx.dispute.update({
        where: { id: disputeId },
        data: { status: 'RESOLVED_CONFIRMED', resolvedByAdminId: adminUserId, resolvedAt: new Date() },
      });
    });
    return payoutService.processPayoutsForCompetition(dispute.competitionId);
  }

  throw new AppError('Unknown dispute resolution action', 422);
}

// Scheduled sweep: any PENDING_CONFIRMATION result whose window has passed
// with no dispute raised gets auto-confirmed and paid out. See docs on why
// this window exists — it lets a competition close fast for everyone
// without needing an Admin to click "confirm" on every single one.
async function autoConfirmDueResults() {
  const due = await prisma.result.findMany({
    where: { status: 'PENDING_CONFIRMATION', confirmationDeadline: { lte: new Date() } },
  });

  const outcomes = [];
  for (const result of due) {
    await prisma.$transaction(async (tx) => {
      await tx.result.update({
        where: { id: result.id },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      });
      await tx.competition.update({
        where: { id: result.competitionId },
        data: { status: 'RESULT_CONFIRMED' },
      });
    });
    outcomes.push(await payoutService.processPayoutsForCompetition(result.competitionId));
  }
  return outcomes;
}

module.exports = { submitResult, raiseDispute, resolveDispute, autoConfirmDueResults };
