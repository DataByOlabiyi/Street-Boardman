const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const env = require('./config/env');
const routes = require('./routes');
const depositController = require('./controllers/depositController');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();

// Must be set before any middleware that reads req.ip (rate limiters
// especially) — see env.trustProxyHops for why this can't just default to
// trusting everything (TASK-010).
app.set('trust proxy', env.trustProxyHops);

app.use(helmet());
app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(cookieParser());

// This one route needs the exact raw bytes of the request body to verify
// Paystack's signature, so it's wired up BEFORE express.json() below and
// bypasses the normal JSON body parser entirely.
app.post(
  '/api/deposits/paystack/webhook',
  express.raw({ type: 'application/json' }),
  depositController.paystackWebhook
);

app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true, mode: env.appMode }));

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
