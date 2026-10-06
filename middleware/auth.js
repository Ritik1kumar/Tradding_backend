const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { verifyAccessToken } = require('../lib/tokens');
const tosVersionService = require('../services/tosVersion.service');

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

// CLAUDE.md §4.1.1: gate everything behind ToS acceptance except the ToS flow
// itself (routes/tos.js, routes/tosVersions.js never apply this — otherwise a
// user who hasn't accepted could never call /tos/accept to accept it).
// If no TosVersion has ever been published, there's nothing to gate on — let
// requests through rather than hard-blocking the whole API over missing seed data.
async function requireTosAccepted(req, res, next) {
  try {
    let current;
    try {
      current = await tosVersionService.getCurrentVersion();
    } catch (err) {
      return next();
    }

    const acceptedVersion = req.user.tosAcceptedVersion;
    if (acceptedVersion === null || acceptedVersion === undefined || acceptedVersion < current.version) {
      throw new AppError(
        'Please accept the latest Terms of Service to continue',
        403,
        'TOS_ACCEPTANCE_REQUIRED'
      );
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticate, requireRole, requireTosAccepted };
