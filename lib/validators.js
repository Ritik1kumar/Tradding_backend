const { AppError } = require('./errors');

const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Guards any :id / :categoryId param before it reaches a Prisma query on a
// @db.Uuid column — otherwise Postgres throws "invalid input syntax for
// uuid" and it surfaces as an unhandled 500 instead of a clean 400.
function validateUuid(value, fieldName = 'id') {
  if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
    throw new AppError(`${fieldName} must be a valid UUID`, 400);
  }
  return value;
}

// Accepts "9810000001", "+919810000001", or "919810000001" and normalizes
// all of them to the canonical "+91XXXXXXXXXX" stored on AppUser.phone.
function validatePhone(phone) {
  if (typeof phone !== 'string') {
    throw new AppError('phone is required and must be a string', 400);
  }

  let digits = phone.trim();
  if (digits.startsWith('+91')) {
    digits = digits.slice(3);
  } else if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith('+')) {
    digits = digits.slice(1);
  }

  if (!INDIAN_MOBILE_REGEX.test(digits)) {
    throw new AppError('phone must be a valid 10-digit Indian mobile number', 400);
  }

  return `+91${digits}`;
}

module.exports = { validatePhone, validateUuid };
