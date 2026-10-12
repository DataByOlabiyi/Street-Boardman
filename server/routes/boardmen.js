const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const boardmanController = require('../controllers/boardmanController');

// Public track record (FEAT-048): declared before the Boardman-only guard.
router.get('/:id/public', boardmanController.getPublicProfile);

router.use(requireAuth, requireRole('BOARDMAN'), boardmanController.requireBoardmanProfile);
router.get('/me', boardmanController.getMyProfile);

module.exports = router;
