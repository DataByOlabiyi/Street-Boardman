const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const notificationController = require('../controllers/notificationController');

// The signed-in user's inbox (FEAT-041): the same rows the worker sends by SMS.
router.use(requireAuth);
router.get('/me', notificationController.listMine);
router.patch('/me/read-all', notificationController.markAllRead);

module.exports = router;
