const authService = require('../services/auth.service');
const { sendSuccess } = require('../lib/response');

async function login(req, res, next) {
  try {
    const { phone } = req.body;
    await authService.login(phone);
    sendSuccess(res, 200, { message: 'OTP sent' });
  } catch (err) {
    next(err);
  }
}

async function verifyOtp(req, res, next) {
  try {
    const { phone, otp } = req.body;
    const result = await authService.verifyOtp({ phone, otp });
    sendSuccess(res, 200, result);
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refreshAccessToken({ refreshToken });
    sendSuccess(res, 200, result);
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;
    await authService.logout({ refreshToken });
    sendSuccess(res, 200, { message: 'Logged out' });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, verifyOtp, refresh, logout };
