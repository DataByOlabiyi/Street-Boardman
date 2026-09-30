const cron = require('node-cron');
const reconciliationService = require('../services/reconciliationService');

// Runs once a day at 03:00 server time — quiet hours, and well clear of
// the every-minute autoConfirmSweep so the two never compete for the same
// rows. Checks every wallet's stored balance against the ledger (TASK-020).
function startReconciliationSweep() {
  cron.schedule('0 3 * * *', async () => {
    try {
      await reconciliationService.runDailyReconciliation();
    } catch (err) {
      console.error('reconciliationSweep failed:', err);
    }
  });
}

module.exports = startReconciliationSweep;
