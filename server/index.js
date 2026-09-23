const app = require('./app');
const env = require('./config/env');
const startAutoConfirmSweep = require('./jobs/autoConfirmSweep');

app.listen(env.port, () => {
  console.log(`StreetBoardman API running on http://localhost:${env.port} [${env.appMode} mode]`);
  startAutoConfirmSweep();
});
