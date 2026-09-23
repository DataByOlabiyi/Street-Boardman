const asyncHandler = require('../utils/asyncHandler');
const prisma = require('../config/db');
const AppError = require('../utils/appError');

// Loads the BoardmanProfile for the current user and attaches it to
// req.boardmanProfile — competition/result routes need this to enforce
// "you can only manage your own competitions".
const requireBoardmanProfile = asyncHandler(async (req, res, next) => {
  const profile = await prisma.boardmanProfile.findUnique({ where: { userId: req.user.id } });
  if (!profile) throw new AppError('Boardman profile not found', 404);
  req.boardmanProfile = profile;
  next();
});

const getMyProfile = asyncHandler(async (req, res) => {
  res.json({ boardmanProfile: req.boardmanProfile });
});

module.exports = { requireBoardmanProfile, getMyProfile };
