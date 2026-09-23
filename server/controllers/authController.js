const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');
const { signAccessToken, signRefreshToken } = require('../utils/jwt');
const { COOKIE_NAMES } = require('../config/constants');
const env = require('../config/env');

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
  return { id: user.id, role: user.role, fullName: user.fullName, phone: user.phone, status: user.status };
}

const registerBetter = asyncHandler(async (req, res) => {
  const user = await authService.registerBetter(req.body);
  issueSession(res, user);
  res.status(201).json({ user: toPublicUser(user) });
});

const registerBoardman = asyncHandler(async (req, res) => {
  const user = await authService.registerBoardman(req.body);
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

module.exports = { registerBetter, registerBoardman, login, logout, toPublicUser };
