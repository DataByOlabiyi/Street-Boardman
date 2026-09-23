const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const validate = require('../middleware/validate');
const withdrawalController = require('../controllers/withdrawalController');
const { withdrawalSchema } = require('../validators/schemas');

router.use(requireAuth);
router.post('/', requireRole('BETTER', 'BOARDMAN'), validate(withdrawalSchema), withdrawalController.requestWithdrawal);
router.get('/me', withdrawalController.listMyWithdrawals);

module.exports = router;
