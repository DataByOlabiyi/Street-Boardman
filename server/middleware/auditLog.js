const prisma = require('../config/db');

// Every sensitive write (admin action, commission change, wallet
// adjustment, dispute resolution) should call this so there's always a
// trail of who did what. beforeState/afterState are plain objects, stored
// as JSON — pass only what's relevant, not entire DB rows with secrets.
//
// Pass `client` (a Prisma interactive-transaction client) when logging a
// change made inside a transaction, so the audit row commits or rolls back
// together with the change it describes instead of drifting from it
// (TASK-012). Defaults to the top-level prisma client for call sites that
// log after the fact.
async function recordAuditLog({ actorUserId, action, entityType, entityId, beforeState, afterState }, client = prisma) {
  await client.auditLog.create({
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
