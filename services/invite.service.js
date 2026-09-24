const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { validatePhone, validateUuid } = require('../lib/validators');
const { buildContainsFilter, buildDateRangeFilter } = require('../lib/filters');

const ALLOWED_ROLE_HINTS = ['buyer', 'seller'];
const VALID_STATUSES = ['pending', 'accepted', 'revoked'];

function normalizeRoleHint(roleHint) {
  const normalized = typeof roleHint === 'string' ? roleHint.toLowerCase() : roleHint;
  if (!ALLOWED_ROLE_HINTS.includes(normalized)) {
    throw new AppError(`roleHint must be one of: ${ALLOWED_ROLE_HINTS.join(', ')}`, 400);
  }
  return normalized;
}

async function sendInvitation({ phone, roleHint, actorUserId }) {
  const normalizedPhone = validatePhone(phone);
  const normalizedRoleHint = normalizeRoleHint(roleHint);

  const existingPending = await prisma.invite.findFirst({
    where: { phone: normalizedPhone, status: 'pending' },
  });
  if (existingPending) {
    throw new AppError('An invite for this phone number is already pending', 409);
  }

  let invite;
  try {
    invite = await prisma.invite.create({
      data: { phone: normalizedPhone, roleHint: normalizedRoleHint, invitedById: actorUserId },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new AppError('An invite for this phone number is already pending', 409);
    }
    throw err;
  }

  await prisma.auditLog.create({
    data: {
      actorUserId,
      action: 'INVITE_SENT',
      entity: 'Invite',
      entityId: invite.id,
      before: null,
      after: invite,
    },
  });

  return invite;
}

async function listInvitations({ status, phone, roleHint, createdFrom, createdTo, skip, take }) {
  if (status && !VALID_STATUSES.includes(status)) {
    throw new AppError(`status must be one of: ${VALID_STATUSES.join(', ')}`, 400);
  }
  if (roleHint && !ALLOWED_ROLE_HINTS.includes(roleHint)) {
    throw new AppError(`roleHint must be one of: ${ALLOWED_ROLE_HINTS.join(', ')}`, 400);
  }

  const phoneFilter = buildContainsFilter(phone);
  const createdAtFilter = buildDateRangeFilter(createdFrom, createdTo, 'created');

  const where = {
    ...(status ? { status } : {}),
    ...(roleHint ? { roleHint } : {}),
    ...(phoneFilter ? { phone: phoneFilter } : {}),
    ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.invite.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.invite.count({ where }),
  ]);
  return { data, total };
}

async function cancelInvitation({ id, actorUserId }) {
  validateUuid(id);
  const invite = await prisma.invite.findUnique({ where: { id } });
  if (!invite) {
    throw new AppError('Invite not found', 404);
  }
  if (invite.status !== 'pending') {
    throw new AppError('Only pending invites can be cancelled', 409);
  }

  const updated = await prisma.invite.update({
    where: { id },
    data: { status: 'revoked' },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId,
      action: 'INVITE_CANCELLED',
      entity: 'Invite',
      entityId: invite.id,
      before: invite,
      after: updated,
    },
  });

  return updated;
}

module.exports = { sendInvitation, listInvitations, cancelInvitation };
