// otplib v13 dropped the old v12 `authenticator` singleton for standalone
// functions, AND its top-level entrypoint (and default crypto/base32
// plugins) pull in ESM-only packages that Jest can't load — see
// server/utils/totpPlugins.js. Importing @otplib/core, @otplib/totp and
// @otplib/uri directly (never the `otplib` package itself) avoids that
// entirely; these three sub-packages are plain CJS with no other deps.
const { generateSecret } = require('@otplib/core');
const { verify } = require('@otplib/totp');
const { generateTOTP } = require('@otplib/uri');
const { base32Plugin, cryptoPlugin } = require('../utils/totpPlugins');
const prisma = require('../config/db');
const AppError = require('../utils/appError');

const ISSUER = 'StreetBoardman';
const plugins = { crypto: cryptoPlugin, base32: base32Plugin };

async function checkToken(secret, token) {
  const result = await verify({ secret, token, ...plugins });
  return result.valid;
}

// Starts enrollment: generates a new TOTP secret and stores it, but does
// NOT enable MFA yet (mfaEnabledAt stays null) until confirmSetup proves
// the user actually scanned it into a real authenticator app (TASK-031).
// Calling this again before confirming just replaces the pending secret —
// harmless, since nothing was enabled with the old one yet.
async function startSetup(userId) {
  const secret = generateSecret({ length: 20, ...plugins });
  const user = await prisma.user.update({
    where: { id: userId },
    data: { mfaSecret: secret },
  });
  const otpauthUrl = generateTOTP({ issuer: ISSUER, label: user.phone, secret });
  return { secret, otpauthUrl };
}

// Confirms enrollment with a real code from the authenticator app. Only
// after this succeeds does mfaEnabledAt get set — this is what stops
// startSetup alone (e.g. an attacker with a stolen session hitting the
// endpoint) from silently enabling MFA with a secret the real user never
// saw.
async function confirmSetup(userId, token) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.mfaSecret) {
    throw new AppError('No MFA enrollment in progress — call the setup endpoint first', 400);
  }
  const isValid = await checkToken(user.mfaSecret, token);
  if (!isValid) throw new AppError('Incorrect code', 400);

  await prisma.user.update({ where: { id: userId }, data: { mfaEnabledAt: new Date() } });
  return { enabled: true };
}

// Verifies a code against an ALREADY-enabled secret — this is what login
// calls, not confirmSetup (TASK-031's actual login gate).
async function verifyToken(userId, token) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.mfaEnabledAt || !user.mfaSecret) {
    throw new AppError('MFA is not enabled for this account', 400);
  }
  return checkToken(user.mfaSecret, token);
}

// Requires a valid current code to turn MFA back off — never a bare
// toggle, since that would defeat the point of a second factor.
async function disableMfa(userId, token) {
  const isValid = await verifyToken(userId, token);
  if (!isValid) throw new AppError('Incorrect code', 400);
  await prisma.user.update({ where: { id: userId }, data: { mfaSecret: null, mfaEnabledAt: null } });
  return { enabled: false };
}

module.exports = { startSetup, confirmSetup, verifyToken, disableMfa };
