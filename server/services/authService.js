const prisma = require('../config/db');
const AppError = require('../utils/appError');
const password = require('../utils/password');
const walletService = require('./walletService');
const deviceService = require('./deviceService');
const { ROLES } = require('../config/constants');
const logger = require('../utils/logger');

async function registerBetter({ fullName, phone, pin }, fingerprint) {
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) throw new AppError('An account with this phone number already exists', 409);

  const pinHash = await password.hash(pin);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { role: ROLES.BETTER, fullName, phone, passwordHash: pinHash, deviceFingerprint: fingerprint },
    });
    await walletService.createWalletForUser(tx, user.id, 'BETTER', true);
    await deviceService.flagIfDeviceReused(tx, { newUserId: user.id, fingerprint });
    return user;
  });
}

async function registerBoardman({ fullName, phone, pin, businessLocation, kycDocumentUrl }, fingerprint) {
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) throw new AppError('An account with this phone number already exists', 409);

  const pinHash = await password.hash(pin);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { role: ROLES.BOARDMAN, fullName, phone, passwordHash: pinHash, deviceFingerprint: fingerprint },
    });
    await tx.boardmanProfile.create({
      data: { userId: user.id, businessLocation, kycDocumentUrl, approvalStatus: 'PENDING_APPROVAL' },
    });
    await walletService.createWalletForUser(tx, user.id, 'BOARDMAN', true);
    await deviceService.flagIfDeviceReused(tx, { newUserId: user.id, fingerprint });
    return user;
  });
}

// Per-account brute-force protection (ASVS 2.2.1). The per-IP limiter
// alone can't stop an attacker spreading guesses across many IPs, and a
// 4-digit PIN is only 10,000 possibilities. After MAX_FAILED_ATTEMPTS
// wrong PINs or MFA codes the account locks for LOCK_MINUTES, capping
// guessing at 20 an hour per account. Short lock on purpose: a long one
// would let anyone lock a user out of their own money by typing their
// phone number wrong five times.
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// Compared against when the phone number doesn't exist, so the response
// takes as long as a real wrong-PIN check and timing doesn't reveal
// which numbers are registered. Generated once, with the real cost
// factor — a malformed hash could fail fast and defeat the point.
let dummyHashPromise;
function dummyCompare(pin) {
  dummyHashPromise = dummyHashPromise || password.hash('not-a-real-account');
  return dummyHashPromise.then((hash) => password.compare(pin, hash));
}

function assertNotLocked(user) {
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    throw new AppError(
      `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      429
    );
  }
}

// Atomic increment, so concurrent wrong guesses can't slip past the limit
// by all reading the same count.
async function recordFailedAttempt(userId) {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: { increment: 1 } },
  });
  if (updated.failedLoginCount >= MAX_FAILED_ATTEMPTS) {
    await prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000) },
    });
    // One lock is a forgetful user; many across accounts is an attack —
    // alert routing (TASK-043) can match on this event.
    logger.warn({ event: 'account_locked', userId, role: updated.role }, 'Account locked after repeated failed logins');
  }
}

async function clearFailedAttempts(user) {
  if (user.failedLoginCount === 0 && !user.lockedUntil) return;
  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
}

async function login({ phone, pin }) {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    await dummyCompare(pin);
    throw new AppError('Invalid phone number or PIN', 401);
  }
  // Checked before the PIN is even compared: guesses made while locked
  // must not tell an attacker whether they were right.
  assertNotLocked(user);
  if (user.status === 'SUSPENDED') throw new AppError('Account suspended, contact support', 403);

  const valid = await password.compare(pin, user.passwordHash);
  if (!valid) {
    await recordFailedAttempt(user.id);
    throw new AppError('Invalid phone number or PIN', 401);
  }

  // With MFA on, the PIN is only half the login — the counter resets once
  // the code is verified too, so PIN guesses and code guesses share one
  // budget.
  if (!user.mfaEnabledAt) await clearFailedAttempts(user);
  return user;
}

module.exports = {
  registerBetter,
  registerBoardman,
  login,
  assertNotLocked,
  recordFailedAttempt,
  clearFailedAttempts,
  MAX_FAILED_ATTEMPTS,
};
