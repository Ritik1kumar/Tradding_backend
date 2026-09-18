const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { verifyAccessToken } = require('../lib/tokens');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new AppError('Unauthorized', 401);
    }

    const token = header.slice('Bearer '.length);

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      throw new AppError('Unauthorized', 401);
    }

    const user = await prisma.appUser.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'active') {
      throw new AppError('Unauthorized', 401);
    }

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
