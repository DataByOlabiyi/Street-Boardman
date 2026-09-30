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
// competition from a second account (TASK-014). Real device/identity
// matching (FEAT-017, Phase 1) doesn't exist yet, so this is deliberately
// partial: the only signal available today without new infrastructure is
// whether the bettor's registered name matches the Boardman's own name.
// That's weak — it catches the laziest version of the abuse and nothing
// more — but it's a real, honest signal rather than pretending to detect
// something the app can't yet see. A match is logged for Admin review,
// never blocked automatically: see the open product decision in the
// implementation plan on whether/when to hard-block.
async function flagIfSelfBettingSuspected(tx, { betId, betterId, boardmanProfile }) {
  const [better, boardmanUser] = await Promise.all([
    tx.user.findUnique({ where: { id: betterId }, select: { fullName: true } }),
    tx.user.findUnique({ where: { id: boardmanProfile.userId }, select: { fullName: true } }),
  ]);
  if (normalizeName(better.fullName) !== normalizeName(boardmanUser.fullName)) return;

  await recordAuditLog(
    {
      actorUserId: betterId,
      action: 'INSIDER_BETTING_SUSPECTED',
      entityType: 'Bet',
      entityId: betId,
      beforeState: null,
      afterState: {
        reason: 'Bettor name matches the Boardman name for this competition',
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

  // Retry once on the rare chance two bets compute the same sequential
  // code at the same instant — the DB's unique constraint is the real
  // guard, this just avoids surfacing that as a user-facing error.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const betCode = await generateBetCode(prisma);
    try {
      return await prisma.$transaction(async (tx) => {
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
    } catch (err) {
      const isBetCodeCollision = err.code === 'P2002' && err.meta?.target?.includes('betCode');
      if (isBetCodeCollision && attempt < 2) continue;
      throw err;
    }
  }
  throw new AppError('Could not place bet, please try again', 500);
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
