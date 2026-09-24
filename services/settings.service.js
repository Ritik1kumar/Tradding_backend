const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { validateSettingValue, validateSettingKey } = require('./settings.validation');
const { buildContainsFilter } = require('../lib/filters');

async function listSettings({ key, skip, take } = {}) {
  const keyFilter = buildContainsFilter(key);
  const where = keyFilter ? { key: keyFilter } : undefined;

  const [data, total] = await Promise.all([
    prisma.setting.findMany({ where, orderBy: { key: 'asc' }, skip, take }),
    prisma.setting.count({ where }),
  ]);
  return { data, total };
}

async function getSetting(key) {
  const setting = await prisma.setting.findUnique({ where: { key } });
  if (!setting) {
    throw new AppError('Setting not found', 404);
  }
  return setting;
}

async function upsertSetting(key, value, actorUserId) {
  const keyError = validateSettingKey(key);
  if (keyError) {
    throw new AppError(keyError, 400);
  }

  const valueError = validateSettingValue(key, value);
  if (valueError) {
    throw new AppError(valueError, 400);
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
