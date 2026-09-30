const app = require('./app');
const env = require('./config/env');
const startAutoConfirmSweep = require('./jobs/autoConfirmSweep');
const startReconciliationSweep = require('./jobs/reconciliationSweep');

app.listen(env.port, () => {
  console.log(`StreetBoardman API running on http://localhost:${env.port} [${env.appMode} mode]`);
  startAutoConfirmSweep();
  startReconciliationSweep();
});
