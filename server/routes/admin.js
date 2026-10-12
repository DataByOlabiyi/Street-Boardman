const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const requirePermission = require('../middleware/requirePermission');
const validate = require('../middleware/validate');
const adminController = require('../controllers/adminController');
const withdrawalController = require('../controllers/withdrawalController');
const adminListController = require('../controllers/adminListController');
const {
  resolveDisputeSchema,
  updateSettingsSchema,
  setStaffRoleSchema,
  adjustmentRequestSchema,
  adjustmentApproveSchema,
  adjustmentRejectSchema,
} = require('../validators/schemas');
const { PERMISSIONS } = require('../config/staffPermissions');
const { requireStaffSecurity } = require('../services/staffSecurityService');

// requireRole('ADMIN') below only gates "can this account reach admin
// routes at all" — requirePermission(...) on each route below is what
// actually authorises the specific action (TASK-030). requireStaffSecurity
// blocks every admin route until the account has MFA and a 12+ character
// password, once STAFF_SECURITY_ENFORCED_FROM has passed.
router.use(requireAuth, requireRole('ADMIN'), requireStaffSecurity);

router.get('/overview', requirePermission(PERMISSIONS.VIEW_ONLY), adminController.getOverview);

router.get('/boardmen', requirePermission(PERMISSIONS.VIEW_ONLY), adminController.listAllBoardmen);
router.get('/boardmen/pending', requirePermission(PERMISSIONS.VIEW_ONLY), adminController.listPendingBoardmen);
router.patch('/boardmen/:id/approve', requirePermission(PERMISSIONS.MANAGE_BOARDMEN), adminController.approveBoardman);
router.patch('/boardmen/:id/reject', requirePermission(PERMISSIONS.MANAGE_BOARDMEN), adminController.rejectBoardman);
router.patch('/boardmen/:id/suspend', requirePermission(PERMISSIONS.MANAGE_BOARDMEN), adminController.suspendBoardman);

router.get('/users', requirePermission(PERMISSIONS.VIEW_ONLY), adminListController.listUsers);
router.patch('/users/:id/suspend', requirePermission(PERMISSIONS.MANAGE_USERS), adminController.suspendUser);
router.patch('/users/:id/reactivate', requirePermission(PERMISSIONS.MANAGE_USERS), adminController.reactivateUser);
router.patch(
  '/staff/:id/role',
  requirePermission(PERMISSIONS.MANAGE_STAFF),
  validate(setStaffRoleSchema),
  adminController.setStaffRole
);

router.get('/competitions', requirePermission(PERMISSIONS.VIEW_ONLY), adminListController.listCompetitions);
router.get('/bets', requirePermission(PERMISSIONS.VIEW_ONLY), adminListController.listBets);

router.get('/disputes', requirePermission(PERMISSIONS.VIEW_ONLY), adminController.listDisputes);
router.patch(
  '/disputes/:id/resolve',
  requirePermission(PERMISSIONS.MANAGE_DISPUTES),
  validate(resolveDisputeSchema),
  adminController.resolveDispute
);

router.get('/withdrawals', requirePermission(PERMISSIONS.MANAGE_WITHDRAWALS), adminListController.listWithdrawals);
router.get('/payouts/float', requirePermission(PERMISSIONS.MANAGE_WITHDRAWALS), withdrawalController.adminPayoutFloat);
router.patch(
  '/withdrawals/:id/process',
  requirePermission(PERMISSIONS.MANAGE_WITHDRAWALS),
  withdrawalController.adminProcessWithdrawal
);
router.patch(
  '/withdrawals/:id/reject',
  requirePermission(PERMISSIONS.MANAGE_WITHDRAWALS),
  withdrawalController.adminRejectWithdrawal
);

router.get('/ledger', requirePermission(PERMISSIONS.VIEW_LEDGER), adminListController.listLedger);
router.get('/reports/summary', requirePermission(PERMISSIONS.VIEW_LEDGER), adminController.getReportSummary);

router.get('/adjustments', requirePermission(PERMISSIONS.VIEW_LEDGER), adminListController.listAdjustments);
router.post(
  '/adjustments',
  requirePermission(PERMISSIONS.ADJUST_BALANCES),
  validate(adjustmentRequestSchema),
  adminController.requestAdjustment
);
router.patch(
  '/adjustments/:id/approve',
  requirePermission(PERMISSIONS.ADJUST_BALANCES),
  validate(adjustmentApproveSchema),
  adminController.approveAdjustment
);
router.patch(
  '/adjustments/:id/reject',
  requirePermission(PERMISSIONS.ADJUST_BALANCES),
  validate(adjustmentRejectSchema),
  adminController.rejectAdjustment
);
router.get('/audit-logs', requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS), adminListController.listAuditLogs);

router.get('/settings', requirePermission(PERMISSIONS.VIEW_ONLY), adminController.getSettings);
router.patch(
  '/settings',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  validate(updateSettingsSchema),
  adminController.updateSettings
);

module.exports = router;
