// Integration tests run with NODE_ENV=test and load .env.test instead of
// .env, so `npm test` never points at your everyday development database —
// see docs/TESTING.md.
require('dotenv').config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// The dev-friendly fallback below only ever protects local development —
// in production it would mean the app runs with a well-known, forgeable
// JWT secret. This throws at startup instead of letting that happen
// silently (TASK-008).
const DEV_DEFAULT_ACCESS_SECRET = 'dev-access-secret';
const DEV_DEFAULT_REFRESH_SECRET = 'dev-refresh-secret';
const MIN_SECRET_LENGTH = 32;

function requiredJwtSecret(name, devDefault) {
  const value = required(name, devDefault);
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (nodeEnv === 'production') {
    if (value === devDefault) {
      throw new Error(
        `${name} is still set to its development default — refusing to start in production`
      );
    }
    if (value.length < MIN_SECRET_LENGTH) {
      throw new Error(`${name} must be at least ${MIN_SECRET_LENGTH} characters in production`);
    }
  }
  return value;
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  appMode: process.env.APP_MODE || 'DEMO', // 'DEMO' | 'PRODUCTION'
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  jwt: {
    accessSecret: requiredJwtSecret('JWT_ACCESS_SECRET', DEV_DEFAULT_ACCESS_SECRET),
    refreshSecret: requiredJwtSecret('JWT_REFRESH_SECRET', DEV_DEFAULT_REFRESH_SECRET),
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL || '7d',
  },

  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || '',
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET || '',
  },

  defaults: {
    boardmanCommissionRate: Number(process.env.DEFAULT_BOARDMAN_COMMISSION_RATE || 0.05),
    platformCommissionRate: Number(process.env.DEFAULT_PLATFORM_COMMISSION_RATE || 0.03),
    resultConfirmationWindowHours: Number(process.env.DEFAULT_RESULT_CONFIRMATION_WINDOW_HOURS || 2),
  },
};
