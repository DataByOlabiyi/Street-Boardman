const cron = require('node-cron');
const reconciliationService = require('../services/reconciliationService');
const { withAdvisoryLock } = require('../utils/advisoryLock');

const LOCK_KEY = 727002;

// Runs once a day at 03:00 server time — quiet hours, and well clear of
// the every-minute autoConfirmSweep so the two never compete for the same
// rows. Checks every wallet's stored balance against the ledger (TASK-020).
function startReconciliationSweep() {
  cron.schedule('0 3 * * *', async () => {
    try {
      // TASK-022: same double-run protection as autoConfirmSweep.
      await withAdvisoryLock(LOCK_KEY, () => reconciliationService.runDailyReconciliation());
    } catch (err) {
      console.error('reconciliationSweep failed:', err);
    }
  });
}

module.exports = startReconciliationSweep;
