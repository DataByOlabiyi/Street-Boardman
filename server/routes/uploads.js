const express = require('express');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { uploadLimiter } = require('../middleware/rateLimit');
const uploadController = require('../controllers/uploadController');
const { MAX_BYTES } = require('../services/uploadService');

const router = express.Router();

// The photo is the raw request body (Content-Type image/jpeg or image/png),
// so no multipart parser is needed. Anything larger than 5 MB is cut off
// by the parser (413) before it is buffered.
router.post(
  '/evidence',
  requireAuth,
  requireRole('BOARDMAN'),
  uploadLimiter,
  express.raw({ type: ['image/jpeg', 'image/png'], limit: MAX_BYTES }),
  uploadController.uploadEvidence
);

// Evidence is shown on the competition page to anyone who bet; ids are
// random UUIDs.
router.get('/evidence/:id', uploadController.getEvidence);

module.exports = router;
