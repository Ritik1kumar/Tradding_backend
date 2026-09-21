// Static/unpersisted stub — not wired to OtpVerification yet (deliberate, per plan).
function sendOtp(phone) {
  console.log(`OTP for ${phone}: 1111`);
}

function verifyOtpCode(phone, code) {
  return code === '1111';
}

module.exports = { sendOtp, verifyOtpCode };
