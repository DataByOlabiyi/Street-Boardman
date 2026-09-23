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

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  appMode: process.env.APP_MODE || 'DEMO', // 'DEMO' | 'PRODUCTION'
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
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
