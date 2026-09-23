const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const validate = require('../middleware/validate');
const { requireBoardmanProfile } = require('../controllers/boardmanController');
const competitionController = require('../controllers/competitionController');
const resultController = require('../controllers/resultController');
const { createCompetitionSchema, submitResultSchema, raiseDisputeSchema } = require('../validators/schemas');

// Public: anyone can browse what's on offer, even before logging in.
router.get('/', competitionController.listOpenCompetitions);
router.get('/:id', competitionController.getCompetition);

// Boardman-only management routes.
router.post(
  '/',
  requireAuth,
  requireRole('BOARDMAN'),
  requireBoardmanProfile,
  validate(createCompetitionSchema),
  competitionController.createCompetition
);
router.get(
  '/mine/list',
  requireAuth,
  requireRole('BOARDMAN'),
  requireBoardmanProfile,
  competitionController.listMyCompetitions
);
router.patch(
  '/:id/close-betting',
  requireAuth,
  requireRole('BOARDMAN'),
  requireBoardmanProfile,
  competitionController.closeBetting
);
router.get(
  '/:id/bets',
  requireAuth,
  requireRole('BOARDMAN'),
  requireBoardmanProfile,
  competitionController.listBetsForMyCompetition
);
router.post(
  '/:id/result',
  requireAuth,
  requireRole('BOARDMAN'),
  requireBoardmanProfile,
  validate(submitResultSchema),
  resultController.submitResult
);

// Any authenticated user with a stake (or the Boardman) can flag a dispute.
router.post(
  '/:id/dispute',
  requireAuth,
  validate(raiseDisputeSchema),
  resultController.raiseDispute
);

module.exports = router;
