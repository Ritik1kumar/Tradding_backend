const ms = require('ms');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const otpService = require('./otp.service');
const { signAccessToken, generateRefreshToken, hashToken } = require('../lib/tokens');

const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';

async function checkLoginEligibility(phone) {
  const user = await prisma.appUser.findUnique({ where: { phone } });

  if (user) {
    if (user.status !== 'active') {
      throw new AppError('Account is not active', 403);
    }
    return { eligible: true, existingUser: user };
  }

  const invite = await prisma.invite.findFirst({
    where: { phone, status: 'pending' },
  });

  if (invite) {
    return { eligible: true, existingUser: null, invite };
  }

  throw new AppError('This number is not invited', 403);
}

async function issueTokenPair(user) {
  const accessToken = signAccessToken(user);
  const refreshTokenPlain = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshTokenPlain),
      expiresAt: new Date(Date.now() + ms(REFRESH_TOKEN_EXPIRES_IN)),
    },
  });

  return { accessToken, refreshToken: refreshTokenPlain };
}

async function login(phone) {
  await checkLoginEligibility(phone);
  otpService.sendOtp(phone);
}

async function verifyOtp({ phone, otp }) {
  if (!otpService.verifyOtpCode(phone, otp)) {
    throw new AppError('Invalid OTP', 401);
  }

  const eligibility = await checkLoginEligibility(phone);
  let user = eligibility.existingUser;

  if (!user) {
    user = await prisma.$transaction(async (tx) => {
      const invite = await tx.invite.findFirst({
        where: { phone, status: 'pending' },
      });
      if (!invite) {
        throw new AppError('This number is not invited', 403);
      }

      const createdUser = await tx.appUser.create({
        data: {
          phone,
          roles: [invite.roleHint],
          invitedById: invite.invitedById,
          status: 'active',
        },
      });

      await tx.invite.update({
        where: { id: invite.id },
        data: { status: 'accepted' },
      });

      return createdUser;
    });
  }

  const tokens = await issueTokenPair(user);
  return { ...tokens, user };
}

async function refreshAccessToken({ refreshToken }) {
  const tokenHash = hashToken(refreshToken);

  const stored = await prisma.refreshToken.findFirst({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
    include: { user: true },
  });

  if (!stored) {
    throw new AppError('Invalid refresh token', 401);
  }

  if (stored.user.status !== 'active') {
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    throw new AppError('Account is not active', 403);
  }

  return { accessToken: signAccessToken(stored.user) };
}

async function logout({ refreshToken }) {
  const tokenHash = hashToken(refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

module.exports = {
  checkLoginEligibility,
  login,
  verifyOtp,
  refreshAccessToken,
  logout,
};
