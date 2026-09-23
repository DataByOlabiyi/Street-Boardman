const AppError = require('../utils/appError');
const { toDecimal, round2 } = require('../utils/money');

// Creates a wallet for a freshly registered user. Every user gets exactly
// one wallet matching their role (Admins don't get a personal wallet here —
// the platform's own commission wallet is a separate seeded record).
async function createWalletForUser(tx, userId, walletType, isDemo) {
  return tx.wallet.create({
    data: { userId, walletType, isDemo, balance: 0 },
  });
}

async function getWalletByUserId(prismaClient, userId) {
  const wallet = await prismaClient.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new AppError('Wallet not found', 404);
  return wallet;
}

async function getPlatformWallet(prismaClient) {
  const wallet = await prismaClient.wallet.findFirst({ where: { walletType: 'PLATFORM' } });
  if (!wallet) throw new AppError('Platform wallet is not set up. Run the seed script.', 500);
  return wallet;
}

// The ONLY place a wallet balance is ever changed. `delta` is signed:
// positive credits the wallet (deposit, win, commission, refund), negative
// debits it (stake, withdrawal). The raw SQL update is conditional on the
// resulting balance staying >= 0, so two concurrent debits can never both
// succeed and push a wallet negative — the loser gets a clean error instead
// of a corrupted balance.
//
// `tx` must be an active Prisma interactive-transaction client, so this
// call is always part of a larger atomic operation (e.g. "deduct stake AND
// create the bet" happen together or not at all).
async function applyWalletTransaction(tx, { walletId, type, delta, referenceType, referenceId, note }) {
  const deltaDecimal = round2(toDecimal(delta));

  const rows = await tx.$queryRaw`
    UPDATE "Wallet"
    SET balance = balance + ${deltaDecimal}
    WHERE id = ${walletId} AND balance + ${deltaDecimal} >= 0
    RETURNING balance
  `;

  if (rows.length === 0) {
    throw new AppError('Insufficient wallet balance', 400);
  }

  const balanceAfter = round2(toDecimal(rows[0].balance));
  const balanceBefore = round2(balanceAfter.minus(deltaDecimal));

  return tx.walletTransaction.create({
    data: {
      walletId,
      type,
      amount: deltaDecimal,
      balanceBefore,
      balanceAfter,
      referenceType,
      referenceId,
      note,
    },
  });
}

module.exports = { createWalletForUser, getWalletByUserId, getPlatformWallet, applyWalletTransaction };
