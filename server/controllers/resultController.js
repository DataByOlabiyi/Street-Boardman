const asyncHandler = require('../utils/asyncHandler');
const resultService = require('../services/resultService');

const submitResult = asyncHandler(async (req, res) => {
  const result = await resultService.submitResult(req.boardmanProfile, req.params.id, req.body);
  res.status(201).json({ result });
});

const raiseDispute = asyncHandler(async (req, res) => {
  const dispute = await resultService.raiseDispute(req.user.id, req.params.id, req.body.reason);
  res.status(201).json({ dispute });
});

module.exports = { submitResult, raiseDispute };
