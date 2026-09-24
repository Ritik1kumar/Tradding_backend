const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { validateSettingValue } = require('./settings.validation');

async function listSettings() {
  return prisma.setting.findMany({ orderBy: { key: 'asc' } });
}

async function getSetting(key) {
  const setting = await prisma.setting.findUnique({ where: { key } });
  if (!setting) {
    throw new AppError('Setting not found', 404);
  }
  return setting;
}

async function upsertSetting(key, value, actorUserId) {
  const validationError = validateSettingValue(key, value);
  if (validationError) {
    throw new AppError(validationError, 400);
  }

  const existing = await prisma.setting.findUnique({ where: { key } });

  const setting = await prisma.setting.upsert({
    where: { key },
    update: { value, updatedBy: actorUserId },
    create: { key, value, updatedBy: actorUserId },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId,
      action: 'SETTING_UPDATED',
      entity: 'Setting',
      entityId: key,
      before: existing ? existing.value : null,
      after: value,
    },
  });

  return setting;
}

async function getSettingValue(key, fallback = null) {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row ? row.value : fallback;
}

module.exports = { listSettings, getSetting, upsertSetting, getSettingValue };
