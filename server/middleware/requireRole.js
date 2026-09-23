const AppError = require('../utils/appError');

// Usage: requireRole('ADMIN') or requireRole('BETTER', 'BOARDMAN')
// Must run after requireAuth, since it reads req.user.
function requireRole(...allowedRoles) {
  return function (req, res, next) {
    if (!req.user) throw new AppError('Not authenticated', 401);
    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError('You do not have permission to do that', 403);
    }
    next();
  };
}

module.exports = requireRole;
