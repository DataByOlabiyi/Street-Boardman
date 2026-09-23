const prisma = require('../config/db');

// Every sensitive write (admin action, commission change, wallet
// adjustment, dispute resolution) should call this so there's always a
// trail of who did what. beforeState/afterState are plain objects, stored
// as JSON — pass only what's relevant, not entire DB rows with secrets.
async function recordAuditLog({ actorUserId, action, entityType, entityId, beforeState, afterState }) {
  await prisma.auditLog.create({
    data: {
      actorUserId: actorUserId || null,
      action,
      entityType,
      entityId,
      beforeState: beforeState ?? undefined,
      afterState: afterState ?? undefined,
    },
  });
}

module.exports = { recordAuditLog };
