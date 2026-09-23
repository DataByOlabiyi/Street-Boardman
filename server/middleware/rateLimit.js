const rateLimit = require('express-rate-limit');

// Tight limit on auth endpoints to slow down brute-force login/PIN guessing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

// Looser limit on betting so a script can't flood the book with bets.
const bettingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' },
});

module.exports = { authLimiter, bettingLimiter };
