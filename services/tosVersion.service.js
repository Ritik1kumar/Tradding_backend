const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');

function isValidUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    new URL(value);
    return true;
  } catch (err) {
    return false;
  }
}

function isValidDate(value) {
  return !Number.isNaN(new Date(value).getTime());
}

async function publishVersion({ effectiveDate, termsUrl, privacyUrl }, actorUserId) {
  if (!isValidUrl(termsUrl)) {
    throw new AppError('termsUrl must be a valid URL', 400);
  }
  if (!isValidUrl(privacyUrl)) {
    throw new AppError('privacyUrl must be a valid URL', 400);
  }
  if (!isValidDate(effectiveDate)) {
    throw new AppError('effectiveDate must be a valid date', 400);
  }

  const latest = await prisma.tosVersion.findFirst({ orderBy: { version: 'desc' } });
  const nextVersion = (latest ? latest.version : 0) + 1;

  const tosVersion = await prisma.tosVersion.create({
    data: {
      version: nextVersion,
      effectiveDate: new Date(effectiveDate),
      termsUrl,
      privacyUrl,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId,
      action: 'TOS_VERSION_PUBLISHED',
      entity: 'TosVersion',
      entityId: String(tosVersion.version),
      before: null,
      after: tosVersion,
    },
  });

  return tosVersion;
}

async function listVersions({ skip, take } = {}) {
  const [data, total] = await Promise.all([
    prisma.tosVersion.findMany({ orderBy: { version: 'desc' }, skip, take }),
    prisma.tosVersion.count(),
  ]);
  return { data, total };
}

async function getCurrentVersion() {
  const current = await prisma.tosVersion.findFirst({ orderBy: { version: 'desc' } });
  if (!current) {
    throw new AppError('No ToS version has been published yet', 500);
  }
  return current;
}

module.exports = { publishVersion, listVersions, getCurrentVersion };
