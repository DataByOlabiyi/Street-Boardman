const crypto = require('crypto');
const prisma = require('../config/db');
const AppError = require('../utils/appError');
const kycProvider = require('./kycProvider');

// BVN/NIN values are never stored in plaintext — a fast, keyless SHA-256
// digest is enough here (unlike passwords/OTPs, this isn't a secret an
// attacker would brute-force against this table alone; it's the same
// input the KYC provider itself would look up, and we never re-derive or
// compare it locally — just record what was checked).
function hashIdentityValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// Verifies a BVN or NIN against the (stubbed, see kycProvider.js) provider
// and records the attempt either way. A match upgrades the user straight
// to TIER_1 — there's no separate "review" state in this MVP; a real
// provider integration would likely also check the returned name matches
// the account's fullName, which the stub doesn't yet model.
async function verifyBvnOrNin(userId, { idType, value }) {
  if (!['BVN', 'NIN'].includes(idType)) {
    throw new AppError('idType must be BVN or NIN', 422);
  }

  const { matched, provider } = await kycProvider.verifyIdentity({ idType, value });

  await prisma.kycVerification.create({
    data: {
      userId,
      idType,
      valueHash: hashIdentityValue(value),
      matched,
      provider,
    },
  });

  if (matched) {
    await prisma.user.update({ where: { id: userId }, data: { kycTier: 'TIER_1' } });
  }

  return { matched, kycTier: matched ? 'TIER_1' : 'TIER_0' };
}

module.exports = { verifyBvnOrNin };
