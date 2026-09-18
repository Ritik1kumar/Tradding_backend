const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');

// Dev stand-in until real OTP/session auth exists (CLAUDE.md §4.1): trusts an
// x-user-id header instead of verifying a token. Do not ship this to production.
async function authenticate(req, res, next) {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) throw new AppError('Unauthorized', 401);

    const user = await prisma.appUser.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('Unauthorized', 401);

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.roles.some((role) => allowedRoles.includes(role))) {
      return next(new AppError('Forbidden', 403));
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
