const AppError = require('../utils/appError');
const env = require('../config/env');

// Stands in for a real BVN/NIN verification provider (Smile ID, Dojah,
// Prembly or Youverify, per the implementation plan) until one is wired
// up with real credentials — same stub pattern as smsProvider.js
// (TASK-025) and withdrawalService.transferFunds (TASK-003).
//
// DEMO mode simulates a real provider deterministically rather than
// always succeeding, so the mismatch path is actually testable: a value
// of 11 repeated zeros ('00000000000') simulates a no-match, anything
// else matches. PRODUCTION throws until a real provider is configured.
async function verifyIdentity({ idType, value }) {
  if (env.appMode === 'PRODUCTION') {
    throw new AppError(
      'No KYC verification provider is configured (see FEAT-015) — cannot verify identity',
      501
    );
  }
  const matched = value !== '00000000000';
  return { matched, provider: 'demo-stub', idType };
}

module.exports = { verifyIdentity };
