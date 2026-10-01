const prisma = require('../config/db');
const AppError = require('../utils/appError');
const walletService = require('./walletService');
const { generateBetCode } = require('../utils/idGenerator');
const { toDecimal, round2 } = require('../utils/money');
const { recordAuditLog } = require('../middleware/auditLog');

const MIN_STAKE = 100; // NGN — keeps demo bets meaningful, avoids 1-kobo noise

function normalizeName(name) {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Heuristic-only, flag-not-block check for a Boardman betting on their own
// competition from a second account (TASK-014). Two weak signals, either
// one enough to flag: the bettor's registered name matches the Boardman's
// own name, or (TASK-029) they registered from the same device
// fingerprint. Neither is proof — shared wifi/a family device can trigger
// the second, a common name the first — but both are real, honest signals
// rather than pretending to detect something the app can't yet see. A
// match is logged for Admin review, never blocked automatically: see the
// open product decision in the implementation plan on whether/when to
// hard-block.
async function flagIfSelfBettingSuspected(tx, { betId, betterId, boardmanProfile }) {
  const [better, boardmanUser] = await Promise.all([
    tx.user.findUnique({ where: { id: betterId }, select: { fullName: true, deviceFingerprint: true } }),
    tx.user.findUnique({
      where: { id: boardmanProfile.userId },
      select: { fullName: true, deviceFingerprint: true },
    }),
  ]);

  const nameMatches = normalizeName(better.fullName) === normalizeName(boardmanUser.fullName);
  const deviceMatches =
    Boolean(better.deviceFingerprint) && better.deviceFingerprint === boardmanUser.deviceFingerprint;
  if (!nameMatches && !deviceMatches) return;

  const reasons = [];
  if (nameMatches) reasons.push('name matches the Boardman');
  if (deviceMatches) reasons.push('registered from the same device as the Boardman');

  await recordAuditLog(
    {
      actorUserId: betterId,
      action: 'INSIDER_BETTING_SUSPECTED',
      entityType: 'Bet',
      entityId: betId,
      beforeState: null,
      afterState: {
        reason: reasons.join('; '),
        betterId,
        boardmanUserId: boardmanProfile.userId,
      },
    },
    tx
  );
}

async function placeBet({ betterId, betOptionId, stake }) {
  const stakeDecimal = round2(toDecimal(stake));
  if (stakeDecimal.lte(0) || stakeDecimal.lt(MIN_STAKE)) {
    throw new AppError(`Minimum stake is ₦${MIN_STAKE}`, 422);
  }

  const betOption = await prisma.betOption.findUnique({
    where: { id: betOptionId },
    include: { competition: { include: { boardmanProfile: true } } },
  });
  if (!betOption) throw new AppError('Betting option not found', 404);

  const competition = betOption.competition;
  if (competition.status !== 'BETTING_OPEN') {
    throw new AppError('Betting is closed for this competition', 400);
  }
  if (new Date(competition.bettingDeadline) <= new Date()) {
    throw new AppError('Betting deadline has passed', 400);
  }

  return prisma.$transaction(async (tx) => {
    const betCode = await generateBetCode(tx);
    const wallet = await walletService.getWalletByUserId(tx, betterId);

    const bet = await tx.bet.create({
      data: {
        betCode,
        betterId,
        competitionId: competition.id,
        betOptionId,
        stake: stakeDecimal,
        potentialPayout: stakeDecimal, // placeholder estimate, refined below
        status: 'OPEN',
      },
    });

    await walletService.applyWalletTransaction(tx, {
      walletId: wallet.id,
      type: 'BET_STAKE',
      delta: stakeDecimal.negated(),
      referenceType: 'Bet',
      referenceId: bet.id,
      note: `Stake on "${betOption.label}" — ${competition.title}`,
      counterparty: { type: 'ESCROW', competitionId: competition.id },
    });

    await flagIfSelfBettingSuspected(tx, {
      betId: bet.id,
      betterId,
      boardmanProfile: competition.boardmanProfile,
    });

    const updatedOption = await tx.betOption.update({
      where: { id: betOptionId },
      data: { totalStaked: { increment: stakeDecimal } },
    });

    // Rough live estimate only: (this bet's share of the option so far)
    // times the current whole-competition pool, minus commission. The
    // real payout is only known once betting closes and all stakes are
    // in — this is clearly labelled as an estimate to the Better.
    const allOptions = await tx.betOption.findMany({ where: { competitionId: competition.id } });
    const wholePool = allOptions.reduce((sum, o) => sum.plus(toDecimal(o.totalStaked)), toDecimal(0));
    const afterCommission = wholePool
      .times(1 - competition.boardmanCommissionRate - competition.platformCommissionRate);
    const estimatedPayout = round2(
      afterCommission.times(stakeDecimal.dividedBy(toDecimal(updatedOption.totalStaked)))
    );

    return tx.bet.update({
      where: { id: bet.id },
      data: { potentialPayout: estimatedPayout },
      include: { betOption: true },
    });
  });
}

async function listBetsForBetter(betterId) {
  return prisma.bet.findMany({
    where: { betterId },
    include: { betOption: { include: { competition: true } } },
    orderBy: { placedAt: 'desc' },
  });
}

async function getBetByCode(betCode, betterId) {
  const bet = await prisma.bet.findUnique({
    where: { betCode },
    include: { betOption: { include: { competition: true } } },
  });
  if (!bet || bet.betterId !== betterId) throw new AppError('Bet ticket not found', 404);
  return bet;
}

module.exports = { placeBet, listBetsForBetter, getBetByCode, MIN_STAKE };
