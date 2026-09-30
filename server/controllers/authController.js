const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');
const deviceService = require('../services/deviceService');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { COOKIE_NAMES } = require('../config/constants');
const env = require('../config/env');
const prisma = require('../config/db');
const AppError = require('../utils/appError');

const cookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: 'lax',
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

const login = asyncHandler(async (req, res) => {
  const user = await authService.login(req.body);
  issueSession(res, user);
  res.json({ user: toPublicUser(user) });
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

module.exports = { registerBetter, registerBoardman, login, logout, refresh, toPublicUser };
