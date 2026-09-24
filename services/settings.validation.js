const SETTINGS_REGISTRY = {
  price_expiry_time: {
    // value shape: { "time": "02:00" } — 24hr HH:mm string; timezone is a fixed
    // code constant (Asia/Kolkata), not stored in this table
    validate: (value) =>
      typeof value === 'object' &&
      value !== null &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time),
  },
};

function validateSettingValue(key, value) {
  if (value === undefined) {
    return 'value is required';
  }

  const known = SETTINGS_REGISTRY[key];
  if (known && !known.validate(value)) {
    return `value is invalid for key "${key}"`;
  }

  return null;
}

module.exports = { SETTINGS_REGISTRY, validateSettingValue };
