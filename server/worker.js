// Standalone worker process (TASK-022): the scheduled sweeps used to start
// inside the API process (server/index.js), which meant every API
// instance ran its own copy of them — fine with exactly one instance, a
// correctness risk the moment there's more than one. This entry point
// runs only the sweeps, with no HTTP server, so it can be deployed and
// scaled independently of the API. The advisory locks in each job
// (server/utils/advisoryLock.js) are what actually stop two replicas of
// *this* process from double-running the same tick.
const startAutoConfirmSweep = require('./jobs/autoConfirmSweep');
const startReconciliationSweep = require('./jobs/reconciliationSweep');

console.log('StreetBoardman worker process starting...');
startAutoConfirmSweep();
startReconciliationSweep();
