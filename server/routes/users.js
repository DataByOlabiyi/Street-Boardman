const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const validate = require('../middleware/validate');
const userController = require('../controllers/userController');
const { kycVerifySchema } = require('../validators/schemas');

router.use(requireAuth);
router.get('/me', userController.getMe);
router.patch('/me', userController.updateMe);
router.post('/me/kyc/verify', validate(kycVerifySchema), userController.verifyKyc);

module.exports = router;
