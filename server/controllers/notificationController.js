const asyncHandler = require('../utils/asyncHandler');
const notificationService = require('../services/notificationService');

const listMine = asyncHandler(async (req, res) => {
  res.json(await notificationService.listForUser(req.user.id));
});

const markAllRead = asyncHandler(async (req, res) => {
  res.json(await notificationService.markAllRead(req.user.id));
});

module.exports = { listMine, markAllRead };
