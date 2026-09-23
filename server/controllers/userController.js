const asyncHandler = require('../utils/asyncHandler');
const prisma = require('../config/db');
const { toPublicUser } = require('./authController');

const getMe = asyncHandler(async (req, res) => {
  let boardmanProfile = null;
  if (req.user.role === 'BOARDMAN') {
    boardmanProfile = await prisma.boardmanProfile.findUnique({ where: { userId: req.user.id } });
  }
  res.json({ user: toPublicUser(req.user), boardmanProfile });
});

const updateMe = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;
  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: { fullName: fullName ?? undefined, email: email ?? undefined },
  });
  res.json({ user: toPublicUser(updated) });
});

module.exports = { getMe, updateMe };
