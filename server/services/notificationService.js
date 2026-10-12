const crypto = require('crypto');
const prisma = require('../config/db');
const smsProvider = require('./smsProvider');
const logger = require('../utils/logger');
const errorTracking = require('../utils/errorTracking');
const { toDecimal } = require('../utils/money');

// User notifications through an outbox (FEAT-041). Money code calls
// enqueue() inside its own transaction, so the message exists exactly when
// the money movement does: a rollback drops it, a crash can't lose it, and
// dedupeKey (e.g. BET_WON:<betId>) makes a payout retry a no-op. The
// worker sends PENDING rows by SMS; the rows double as the in-app inbox.
const MAX_ATTEMPTS = 5;
const SEND_BATCH = 100;

const naira = (amount) => `N${toDecimal(amount).toNumber().toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const messages = {
  betWon: ({ amount, competitionTitle }) =>
    `StreetBoardman: you won ${naira(amount)} on "${competitionTitle}". It's in your wallet.`,
  competitionCancelled: ({ stake, competitionTitle }) =>
    `StreetBoardman: "${competitionTitle}" was cancelled. Your ${naira(stake)} stake is back in your wallet.`,
  withdrawalPaid: ({ amount }) => `StreetBoardman: your withdrawal of ${naira(amount)} has been sent to your bank.`,
  withdrawalFailed: ({ amount }) =>
    `StreetBoardman: your withdrawal of ${naira(amount)} could not be sent. The money is back in your wallet.`,
  withdrawalRejected: ({ amount }) =>
    `StreetBoardman: your withdrawal of ${naira(amount)} was not approved. The money is back in your wallet.`,
};

// ON CONFLICT DO NOTHING rather than catching a unique violation: Postgres
// aborts the surrounding transaction on any failed statement, which would
// roll back the money movement too.
async function enqueue(tx, { userId, type, message, dedupeKey }) {
  await tx.$executeRaw`
    INSERT INTO "Notification" ("id", "userId", "type", "message", "dedupeKey")
    VALUES (${crypto.randomUUID()}, ${userId}, ${type}, ${message}, ${dedupeKey})
    ON CONFLICT ("dedupeKey") DO NOTHING`;
}

// Worker job: send what's pending, oldest first. Runs under an advisory
// lock (one sender at a time), so plain reads and updates are enough.
async function sendPending({ limit = SEND_BATCH } = {}) {
  const pending = await prisma.notification.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: { user: { select: { phone: true } } },
  });
  let sent = 0;
  let failed = 0;
  for (const n of pending) {
    try {
      await smsProvider.sendSms(n.user.phone, n.message);
      await prisma.notification.update({ where: { id: n.id }, data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 } } });
      sent += 1;
    } catch (err) {
      const attempts = n.attempts + 1;
      const givingUp = attempts >= MAX_ATTEMPTS;
      await prisma.notification.update({
        where: { id: n.id },
        data: { attempts, lastError: String(err.message).slice(0, 500), status: givingUp ? 'FAILED' : 'PENDING' },
      });
      failed += 1;
      logger.warn({ event: 'notification_send_failed', notificationId: n.id, attempts, givingUp }, 'Notification send failed');
      if (givingUp) errorTracking.captureMessage('Notification gave up after retries', { notificationId: n.id, type: n.type }, 'warning');
    }
  }
  return { attempted: pending.length, sent, failed };
}

async function listForUser(userId, { take = 50 } = {}) {
  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, type: true, message: true, createdAt: true, readAt: true },
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { notifications, unread };
}

async function markAllRead(userId) {
  const { count } = await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  return { marked: count };
}

module.exports = { enqueue, messages, sendPending, listForUser, markAllRead, MAX_ATTEMPTS };
