const router = require('express').Router();
const authController = require('../controllers/authController');
const validate = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimit');
const {
  registerBetterSchema,
  registerBoardmanSchema,
  loginSchema,
} = require('../validators/schemas');

router.post('/register/better', authLimiter, validate(registerBetterSchema), authController.registerBetter);
router.post('/register/boardman', authLimiter, validate(registerBoardmanSchema), authController.registerBoardman);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/logout', authController.logout);

module.exports = router;
