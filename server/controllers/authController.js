const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');
const deviceService = require('../services/deviceService');
const mfaService = require('../services/mfaService');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  signMfaChallengeToken,
  verifyMfaChallengeToken,
} = require('../utils/jwt');
const { COOKIE_NAMES } = require('../config/constants');
const env = require('../config/env');
const prisma = require('../config/db');
const AppError = require('../utils/appError');

// Derived centrally in config/env.js (TASK-032) — secure/sameSite need to
// stay coupled (SameSite=None without Secure gets silently dropped by
// browsers), so that logic lives in one place, not duplicated here.
const cookieOptions = {
  httpOnly: true,
  secure: env.cookies.secure,
  sameSite: env.cookies.sameSite,
};

function issueSession(res, user) {
  res.cookie(COOKIE_NAMES.ACCESS, signAccessToken(user), {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000,
  });
  res.cookie(COOKIE_NAMES.REFRESH, signRefreshToken(user), {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function toPublicUser(user) {
  return {
    id: user.id,
    role: user.role,
    fullName: user.fullName,
    phone: user.phone,
    status: user.status,
    phoneVerifiedAt: user.phoneVerifiedAt,
    kycTier: user.kycTier,
    // Status only — the TOTP secret itself never leaves the server.
    mfaEnabled: Boolean(user.mfaEnabledAt),
  };
}

const registerBetter = asyncHandler(async (req, res) => {
  const fingerprint = deviceService.computeFingerprint(req);
  const user = await authService.registerBetter(req.body, fingerprint);
  issueSession(res, user);
  res.status(201).json({ user: toPublicUser(user) });
});

const registerBoardman = asyncHandler(async (req, res) => {
  const fingerprint = deviceService.computeFingerprint(req);
  const user = await authService.registerBoardman(req.body, fingerprint);
  issueSession(res, user);
  res.status(201).json({
    user: toPublicUser(user),
    message: 'Registered. Your account is pending Admin approval before you can run real competitions.',
  });
});

// Accounts without MFA enabled (the seeded admin, every Better/Boardman,
// any admin who hasn't completed enrollment yet) keep the existing
// single-step login — MFA is mandatory only from the moment an admin
// finishes setup, not retroactively forced on every staff account
// (TASK-031).
const login = asyncHandler(async (req, res) => {
  const user = await authService.login(req.body);

  if (user.mfaEnabledAt) {
    const mfaToken = signMfaChallengeToken(user);
    return res.json({ mfaRequired: true, mfaToken });
  }

  issueSession(res, user);
  res.json({ user: toPublicUser(user) });
});

const mfaVerify = asyncHandler(async (req, res) => {
  const { mfaToken, code } = req.body;
  if (!mfaToken || !code) throw new AppError('mfaToken and code are required', 400);

  let payload;
  try {
    payload = verifyMfaChallengeToken(mfaToken);
  } catch (err) {
    throw new AppError('MFA challenge expired, please log in again', 401);
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.mfaEnabledAt) throw new AppError('MFA challenge expired, please log in again', 401);
  if (user.status === 'SUSPENDED') throw new AppError('Account suspended, contact support', 403);

  const isValid = await mfaService.verifyToken(user.id, code);
  if (!isValid) throw new AppError('Incorrect code', 400);

  issueSession(res, user);
  res.json({ user: toPublicUser(user) });
});

const mfaSetupStart = asyncHandler(async (req, res) => {
  const { secret, otpauthUrl } = await mfaService.startSetup(req.user.id);
  res.json({ secret, otpauthUrl });
});

const mfaSetupConfirm = asyncHandler(async (req, res) => {
  const { code } = req.body;
  if (!code) throw new AppError('code is required', 400);
  const result = await mfaService.confirmSetup(req.user.id, code);
  res.json(result);
});

const mfaDisable = asyncHandler(async (req, res) => {
  const { code } = req.body;
  if (!code) throw new AppError('code is required', 400);
  const result = await mfaService.disableMfa(req.user.id, code);
  res.json(result);
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie(COOKIE_NAMES.ACCESS, cookieOptions);
  res.clearCookie(COOKIE_NAMES.REFRESH, cookieOptions);
  res.json({ ok: true });
});

// Lets a session outlive the 15-minute access token without asking the
// user to log in again. Re-checks the user's current role/status (not just
// what was true when the refresh token was issued) and rotates both
// cookies (TASK-009).
//
// This is stateless JWT rotation, not revocable server-side — there's no
// refresh-token table yet, so "log out everywhere" isn't possible. That's
// a deliberate Phase 1 addition (ties into the staff session work in
// EPIC-004), not an oversight here.
const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[COOKIE_NAMES.REFRESH];
  if (!token) throw new AppError('Not authenticated', 401);

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch (err) {
    res.clearCookie(COOKIE_NAMES.ACCESS, cookieOptions);
    res.clearCookie(COOKIE_NAMES.REFRESH, cookieOptions);
    throw new AppError('Session expired, please log in again', 401);
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.status === 'SUSPENDED') {
    res.clearCookie(COOKIE_NAMES.ACCESS, cookieOptions);
    res.clearCookie(COOKIE_NAMES.REFRESH, cookieOptions);
    throw new AppError('Not authenticated', 401);
  }

  issueSession(res, user);
  res.json({ user: toPublicUser(user) });
});

module.exports = {
  registerBetter,
  registerBoardman,
  login,
  mfaVerify,
  mfaSetupStart,
  mfaSetupConfirm,
  mfaDisable,
  logout,
  refresh,
  toPublicUser,
};
