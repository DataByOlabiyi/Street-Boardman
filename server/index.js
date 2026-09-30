// Scheduled sweeps (auto-confirm, payout retry, reconciliation) run in the
// separate worker process (server/worker.js), not here — see TASK-022.
const app = require('./app');
const env = require('./config/env');

app.listen(env.port, () => {
  console.log(`StreetBoardman API running on http://localhost:${env.port} [${env.appMode} mode]`);
});
