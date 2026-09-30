const jwt = require('jsonwebtoken');
const env = require('../config/env');

function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessTtl,
  });
}

function signRefreshToken(user) {
  return jwt.sign({ sub: user.id }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshTtl,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret);
}

// Proves only "phone/PIN were correct" — signed with a separate secret from
// the real session tokens so it can never be presented to requireAuth as a
// substitute for completing the MFA step (TASK-031).
function signMfaChallengeToken(user) {
  return jwt.sign({ sub: user.id, purpose: 'mfa_challenge' }, env.jwt.mfaChallengeSecret, {
    expiresIn: env.jwt.mfaChallengeTtl,
  });
}

function verifyMfaChallengeToken(token) {
  const payload = jwt.verify(token, env.jwt.mfaChallengeSecret);
  if (payload.purpose !== 'mfa_challenge') throw new Error('Invalid token purpose');
  return payload;
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  signMfaChallengeToken,
  verifyMfaChallengeToken,
};
