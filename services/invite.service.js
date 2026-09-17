const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');

const PHONE_REGEX = /^\+?[0-9]{10,15}$/;
const ALLOWED_ROLE_HINTS = ['buyer', 'seller'];
const VALID_STATUSES = ['pending', 'accepted', 'revoked'];

function validatePhone(phone) {
  if (typeof phone !== 'string' || !PHONE_REGEX.test(phone)) {
    throw new AppError('Invalid phone number format', 400);
  }
}

function normalizeRoleHint(roleHint) {
  const normalized = typeof roleHint === 'string' ? roleHint.toLowerCase() : roleHint;
  if (!ALLOWED_ROLE_HINTS.includes(normalized)) {
    throw new AppError(`roleHint must be one of: ${ALLOWED_ROLE_HINTS.join(', ')}`, 400);
  }
  return normalized;
}

async function sendInvitation({ phone, roleHint, actorUserId }) {
  validatePhone(phone);
  const normalizedRoleHint = normalizeRoleHint(roleHint);

  const existingPending = await prisma.invite.findFirst({
    where: { phone, status: 'pending' },
  });
  if (existingPending) {
    throw new AppError('An invite for this phone number is already pending', 409);
  }

  const invite = await prisma.invite.create({
    data: { phone, roleHint: normalizedRoleHint, invitedById: actorUserId },
  });

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

async function listInvitations({ status }) {
  if (status && !VALID_STATUSES.includes(status)) {
    throw new AppError(`status must be one of: ${VALID_STATUSES.join(', ')}`, 400);
  }

  return prisma.invite.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
  });
}

async function cancelInvitation({ id, actorUserId }) {
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
