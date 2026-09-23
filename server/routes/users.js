const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const userController = require('../controllers/userController');

router.use(requireAuth);
router.get('/me', userController.getMe);
router.patch('/me', userController.updateMe);

module.exports = router;
