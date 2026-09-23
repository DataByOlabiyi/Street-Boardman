const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const boardmanController = require('../controllers/boardmanController');

router.use(requireAuth, requireRole('BOARDMAN'), boardmanController.requireBoardmanProfile);
router.get('/me', boardmanController.getMyProfile);

module.exports = router;
