const cron = require('node-cron');
const competitionService = require('../services/competitionService');
const resultService = require('../services/resultService');

// Runs every minute:
//  1. Auto-closes betting on any competition whose deadline has passed.
//  2. Auto-confirms any result whose confirmation window has passed
//     without a dispute, and runs the payout engine for it.
//  3. Retries any competition stuck in RESULT_CONFIRMED or
//     PAYOUT_PROCESSING (payout never started, or was interrupted
//     partway through) — TASK-005, builds on TASK-006's resumable,
//     per-bet-chunked payouts.
// This is what makes "no dispute raised -> auto-confirmed" (see docs
// section 10) actually happen without an Admin manually clicking confirm
// on every ordinary competition.
function startAutoConfirmSweep() {
  cron.schedule('* * * * *', async () => {
    try {
      await competitionService.autoCloseExpiredCompetitions();
      await resultService.autoConfirmDueResults();
      await resultService.retryStuckPayouts();
    } catch (err) {
      console.error('autoConfirmSweep failed:', err);
    }
  });
}

module.exports = startAutoConfirmSweep;
