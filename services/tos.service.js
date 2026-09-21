const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const tosVersionService = require('./tosVersion.service');

function formatStatus(current, user) {
  return {
    needsAcceptance:
      user.tosAcceptedVersion === null || user.tosAcceptedVersion < current.version,
    currentVersion: {
      version: current.version,
      termsUrl: current.termsUrl,
      privacyUrl: current.privacyUrl,
      effectiveDate: current.effectiveDate,
    },
    acceptedVersion: user.tosAcceptedVersion,
    acceptedAt: user.tosAcceptedAt,
  };
}

async function getTosStatus(userId) {
  const current = await tosVersionService.getCurrentVersion();
  const user = await prisma.appUser.findUnique({ where: { id: userId } });
  return formatStatus(current, user);
}

async function acceptTos(userId, requestedVersion) {
  const current = await tosVersionService.getCurrentVersion();

  if (requestedVersion !== current.version) {
    throw new AppError('A newer version of the Terms is available, please review again', 409);
  }

  const updated = await prisma.appUser.update({
    where: { id: userId },
    data: { tosAcceptedVersion: current.version, tosAcceptedAt: new Date() },
  });

  return formatStatus(current, updated);
}

module.exports = { getTosStatus, acceptTos };
