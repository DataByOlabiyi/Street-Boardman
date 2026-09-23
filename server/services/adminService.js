const prisma = require('../config/db');
const AppError = require('../utils/appError');
const { recordAuditLog } = require('../middleware/auditLog');

async function listPendingBoardmen() {
  return prisma.boardmanProfile.findMany({
    where: { approvalStatus: 'PENDING_APPROVAL' },
    include: { user: true },
    orderBy: { createdAt: 'asc' },
  });
}

async function listAllBoardmen() {
  return prisma.boardmanProfile.findMany({ include: { user: true }, orderBy: { createdAt: 'desc' } });
}

async function approveBoardman(boardmanProfileId, adminUserId) {
  const before = await prisma.boardmanProfile.findUnique({ where: { id: boardmanProfileId } });
  if (!before) throw new AppError('Boardman not found', 404);

  const updated = await prisma.boardmanProfile.update({
    where: { id: boardmanProfileId },
    data: { approvalStatus: 'APPROVED', approvedByAdminId: adminUserId, approvedAt: new Date() },
  });
  await recordAuditLog({
    actorUserId: adminUserId,
    action: 'BOARDMAN_APPROVED',
    entityType: 'BoardmanProfile',
    entityId: boardmanProfileId,
    beforeState: { approvalStatus: before.approvalStatus },
    afterState: { approvalStatus: 'APPROVED' },
  });
  return updated;
}

async function rejectBoardman(boardmanProfileId, adminUserId, reason) {
  const before = await prisma.boardmanProfile.findUnique({ where: { id: boardmanProfileId } });
  if (!before) throw new AppError('Boardman not found', 404);

  const updated = await prisma.boardmanProfile.update({
    where: { id: boardmanProfileId },
    data: { approvalStatus: 'REJECTED' },
  });
  await recordAuditLog({
    actorUserId: adminUserId,
    action: 'BOARDMAN_REJECTED',
    entityType: 'BoardmanProfile',
    entityId: boardmanProfileId,
    beforeState: { approvalStatus: before.approvalStatus },
    afterState: { approvalStatus: 'REJECTED', reason },
  });
  return updated;
}

async function suspendBoardman(boardmanProfileId, adminUserId) {
  return prisma.boardmanProfile.update({
    where: { id: boardmanProfileId },
    data: { approvalStatus: 'SUSPENDED' },
  }).then(async (updated) => {
    await recordAuditLog({
      actorUserId: adminUserId,
      action: 'BOARDMAN_SUSPENDED',
      entityType: 'BoardmanProfile',
      entityId: boardmanProfileId,
    });
    return updated;
  });
}

async function suspendUser(userId, adminUserId) {
  const updated = await prisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });
  await recordAuditLog({ actorUserId: adminUserId, action: 'USER_SUSPENDED', entityType: 'User', entityId: userId });
  return updated;
}

async function reactivateUser(userId, adminUserId) {
  const updated = await prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
  await recordAuditLog({ actorUserId: adminUserId, action: 'USER_REACTIVATED', entityType: 'User', entityId: userId });
  return updated;
}

async function listUsers() {
  return prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
}

async function getFinancialLedger({ take = 100 } = {}) {
  return prisma.walletTransaction.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    include: { wallet: { include: { user: true } } },
  });
}

module.exports = {
  listPendingBoardmen,
  listAllBoardmen,
  approveBoardman,
  rejectBoardman,
  suspendBoardman,
  suspendUser,
  reactivateUser,
  listUsers,
  getFinancialLedger,
};
