const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const prisma = require('../config/db');
const { STAFF_VISIBLE_USER_FIELDS } = require('../utils/userSelect');
const { parseListQuery, dateRange, runList } = require('../utils/listQuery');
const { adjustmentInclude } = require('../services/adjustmentService');
const { withOptionTotals } = require('../services/optionTotals');

// Admin back-office lists (FEAT-045): every list pages, filters and
// exports to CSV (?format=csv) the same way. Response keys are unchanged
// from before, plus `page`.
const search = z.string().trim().min(1).max(100).optional();
const id = z.string().min(1).max(64).optional();
const contains = (value) => ({ contains: value, mode: 'insensitive' });
const staffUser = { select: STAFF_VISIBLE_USER_FIELDS };

const listUsers = asyncHandler(async (req, res) => {
  const q = parseListQuery(req.query, {
    role: z.enum(['BETTER', 'BOARDMAN', 'ADMIN']).optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
    kycTier: z.enum(['TIER_0', 'TIER_1']).optional(),
    q: search,
  });
  const where = {
    role: q.role,
    status: q.status,
    kycTier: q.kycTier,
    createdAt: dateRange(q),
    ...(q.q ? { OR: [{ fullName: contains(q.q) }, { phone: { contains: q.q } }] } : {}),
  };
  await runList({
    req, res, q, where,
    model: prisma.user,
    select: STAFF_VISIBLE_USER_FIELDS,
    orderBy: { createdAt: 'desc' },
    key: 'users',
    resource: 'users',
    columns: [
      ['id', (u) => u.id], ['role', (u) => u.role], ['staffRole', (u) => u.staffRole], ['fullName', (u) => u.fullName],
      ['phone', (u) => u.phone], ['status', (u) => u.status], ['kycTier', (u) => u.kycTier], ['createdAt', (u) => u.createdAt],
    ],
  });
});

const listCompetitions = asyncHandler(async (req, res) => {
  const q = parseListQuery(req.query, {
    status: z
      .enum(['DRAFT', 'BETTING_OPEN', 'BETTING_CLOSED', 'PENDING_CONFIRMATION', 'RESULT_CONFIRMED', 'DISPUTED',
        'PAYOUT_PROCESSING', 'COMPLETED', 'CANCELLED_REFUNDED'])
      .optional(),
    category: z.enum(['FOOTBALL', 'SNOOKER', 'FIGHT', 'TABLE_GAME', 'OTHER']).optional(),
    boardmanProfileId: id,
    q: search,
  });
  const where = {
    status: q.status,
    category: q.category,
    boardmanProfileId: q.boardmanProfileId,
    createdAt: dateRange(q),
    ...(q.q ? { title: contains(q.q) } : {}),
  };
  await runList({
    req, res, q, where,
    model: prisma.competition,
    include: { betOptions: true, result: true, boardmanProfile: { include: { user: staffUser } } },
    decorate: withOptionTotals,
    orderBy: { createdAt: 'desc' },
    key: 'competitions',
    resource: 'competitions',
    columns: [
      ['id', (c) => c.id], ['title', (c) => c.title], ['category', (c) => c.category], ['status', (c) => c.status],
      ['boardman', (c) => c.boardmanProfile?.user?.fullName], ['bettingDeadline', (c) => c.bettingDeadline],
      ['totalStaked', (c) => c.betOptions.reduce((sum, o) => sum + Number(o.totalStaked), 0).toFixed(2)],
      ['createdAt', (c) => c.createdAt],
    ],
  });
});

const listBets = asyncHandler(async (req, res) => {
  const q = parseListQuery(req.query, {
    status: z.enum(['OPEN', 'WON', 'LOST', 'REFUNDED', 'VOID']).optional(),
    competitionId: id,
    betterId: id,
    q: search,
  });
  const where = {
    status: q.status,
    competitionId: q.competitionId,
    betterId: q.betterId,
    placedAt: dateRange(q),
    ...(q.q ? { betCode: contains(q.q) } : {}),
  };
  await runList({
    req, res, q, where,
    model: prisma.bet,
    include: { better: { select: { fullName: true, phone: true } }, betOption: { include: { competition: true } } },
    orderBy: { placedAt: 'desc' },
    key: 'bets',
    resource: 'bets',
    columns: [
      ['betCode', (b) => b.betCode], ['better', (b) => b.better?.fullName], ['phone', (b) => b.better?.phone],
      ['competition', (b) => b.betOption?.competition?.title], ['option', (b) => b.betOption?.label],
      ['stake', (b) => b.stake], ['potentialPayout', (b) => b.potentialPayout], ['status', (b) => b.status],
      ['placedAt', (b) => b.placedAt],
    ],
  });
});

const listLedger = asyncHandler(async (req, res) => {
  const q = parseListQuery(req.query, {
    type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'BET_STAKE', 'BET_WIN', 'COMMISSION', 'REFUND', 'ADJUSTMENT']).optional(),
    walletId: id,
    userId: id,
  });
  const where = {
    type: q.type,
    walletId: q.walletId,
    createdAt: dateRange(q),
    ...(q.userId ? { wallet: { userId: q.userId } } : {}),
  };
  await runList({
    req, res, q, where,
    model: prisma.walletTransaction,
    include: { wallet: { include: { user: staffUser } } },
    orderBy: { createdAt: 'desc' },
    key: 'transactions',
    resource: 'ledger',
    columns: [
      ['id', (t) => t.id], ['createdAt', (t) => t.createdAt], ['user', (t) => t.wallet?.user?.fullName],
      ['walletType', (t) => t.wallet?.walletType], ['type', (t) => t.type], ['amount', (t) => t.amount],
      ['balanceAfter', (t) => t.balanceAfter], ['referenceType', (t) => t.referenceType],
      ['referenceId', (t) => t.referenceId], ['note', (t) => t.note],
    ],
  });
});

const listAuditLogs = asyncHandler(async (req, res) => {
  const q = parseListQuery(req.query, {
    action: z.string().regex(/^[A-Z_]{2,64}$/).optional(),
    actorUserId: id,
    entityType: z.string().regex(/^[A-Za-z]{2,64}$/).optional(),
    entityId: id,
  });
  const where = {
    action: q.action,
    actorUserId: q.actorUserId,
    entityType: q.entityType,
    entityId: q.entityId,
    createdAt: dateRange(q),
  };
  await runList({
    req, res, q, where,
    model: prisma.auditLog,
    orderBy: { createdAt: 'desc' },
    key: 'logs',
    resource: 'audit-logs',
    columns: [
      ['id', (l) => l.id], ['createdAt', (l) => l.createdAt], ['actorUserId', (l) => l.actorUserId],
      ['action', (l) => l.action], ['entityType', (l) => l.entityType], ['entityId', (l) => l.entityId],
      ['beforeState', (l) => (l.beforeState ? JSON.stringify(l.beforeState) : '')],
      ['afterState', (l) => (l.afterState ? JSON.stringify(l.afterState) : '')],
    ],
  });
});

// Finance staff had no way to see what was waiting to be paid out.
const listWithdrawals = asyncHandler(async (req, res) => {
  const q = parseListQuery(req.query, {
    status: z.enum(['PENDING', 'APPROVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'REJECTED']).optional(),
    userId: id,
  });
  const where = { status: q.status, userId: q.userId, requestedAt: dateRange(q) };
  await runList({
    req, res, q, where,
    model: prisma.withdrawal,
    include: { user: staffUser },
    orderBy: { requestedAt: 'desc' },
    key: 'withdrawals',
    resource: 'withdrawals',
    columns: [
      ['id', (w) => w.id], ['requestedAt', (w) => w.requestedAt], ['user', (w) => w.user?.fullName],
      ['phone', (w) => w.user?.phone], ['amount', (w) => w.amount], ['status', (w) => w.status],
      ['bank', (w) => w.destination?.bankName], ['accountNumber', (w) => w.destination?.accountNumber],
      ['transferReference', (w) => w.transferReference], ['failureReason', (w) => w.failureReason],
      ['processedAt', (w) => w.processedAt],
    ],
  });
});

const listAdjustments = asyncHandler(async (req, res) => {
  const q = parseListQuery(req.query, { status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() });
  await runList({
    req, res, q,
    where: { status: q.status, createdAt: dateRange(q) },
    model: prisma.walletAdjustment,
    include: adjustmentInclude,
    orderBy: { createdAt: 'desc' },
    key: 'adjustments',
    resource: 'adjustments',
    columns: [
      ['id', (a) => a.id], ['createdAt', (a) => a.createdAt], ['user', (a) => a.wallet?.user?.fullName],
      ['amount', (a) => a.amount], ['reason', (a) => a.reason], ['status', (a) => a.status],
      ['requestedBy', (a) => a.requestedBy?.fullName], ['reviewedBy', (a) => a.reviewedBy?.fullName],
      ['reviewNote', (a) => a.reviewNote], ['reviewedAt', (a) => a.reviewedAt],
    ],
  });
});

module.exports = {
  listUsers,
  listCompetitions,
  listBets,
  listLedger,
  listAuditLogs,
  listWithdrawals,
  listAdjustments,
};
