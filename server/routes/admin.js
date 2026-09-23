const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const validate = require('../middleware/validate');
const adminController = require('../controllers/adminController');
const withdrawalController = require('../controllers/withdrawalController');
const { resolveDisputeSchema, updateSettingsSchema } = require('../validators/schemas');

router.use(requireAuth, requireRole('ADMIN'));

router.get('/overview', adminController.getOverview);

router.get('/boardmen', adminController.listAllBoardmen);
router.get('/boardmen/pending', adminController.listPendingBoardmen);
router.patch('/boardmen/:id/approve', adminController.approveBoardman);
router.patch('/boardmen/:id/reject', adminController.rejectBoardman);
router.patch('/boardmen/:id/suspend', adminController.suspendBoardman);

router.get('/users', adminController.listUsers);
router.patch('/users/:id/suspend', adminController.suspendUser);
router.patch('/users/:id/reactivate', adminController.reactivateUser);

router.get('/competitions', adminController.listCompetitions);
router.get('/bets', adminController.listBets);

router.get('/disputes', adminController.listDisputes);
router.patch('/disputes/:id/resolve', validate(resolveDisputeSchema), adminController.resolveDispute);

router.patch('/withdrawals/:id/process', withdrawalController.adminProcessWithdrawal);
router.patch('/withdrawals/:id/reject', withdrawalController.adminRejectWithdrawal);

router.get('/ledger', adminController.getLedger);
router.get('/audit-logs', adminController.getAuditLogs);

router.get('/settings', adminController.getSettings);
router.patch('/settings', validate(updateSettingsSchema), adminController.updateSettings);

module.exports = router;
